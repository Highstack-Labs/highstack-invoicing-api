import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { DatabaseService } from '../../../database';
import { IdentificacionValidatorService } from './identificacion-validator.service';

export interface ConsultaContribuyenteResult {
  identificacion: string;
  tipoIdentificacion: '04' | '05' | '06' | '07';
  formatoValido: boolean;
  errorValidacion?: string;
  existeEnSri: boolean;
  estadoContribuyente?: string;
  razonSocial?: string;
  nombreComercial?: string;
  direccionMatriz?: string;
  tipoContribuyente?: string;
  regimen?: string;
  obligadoContabilidad?: 'SI' | 'NO';
  agenteRetencion?: string;
  contribuyenteEspecial?: string;
  actividadEconomica?: string;
  emailSugerido?: string;
  telefonoSugerido?: string;
  fuente:
    | 'SRI_CATASTRO'
    | 'BD_LOCAL'
    | 'VALIDADOR_ALGORITMICO'
    | 'SRI_CONSUMIDOR_FINAL';
  mensaje?: string;
}

@Injectable()
export class ContribuyenteCatastroService {
  private readonly logger = new Logger(ContribuyenteCatastroService.name);

  private static readonly SRI_CATASTRO_BASES = [
    'https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest',
    'https://declaraciones.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest',
  ];

  private static readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
  private readonly memoryCache = new Map<
    string,
    { expiresAt: number; data: ConsultaContribuyenteResult }
  >();

  constructor(
    private readonly identificacionValidator: IdentificacionValidatorService,
    private readonly db: DatabaseService,
  ) {}

  /**
   * Consulta y valida automáticamente un RUC (13 dígitos) o Cédula (10 dígitos)
   * combinando validación algorítmica (Módulo 10/11), caché, BD local y el Catastro público del SRI.
   */
  async consultarContribuyente(
    rawIdentificacion: string,
  ): Promise<ConsultaContribuyenteResult> {
    const identificacion = String(rawIdentificacion || '').trim();

    if (!identificacion) {
      return {
        identificacion: '',
        tipoIdentificacion: '04',
        formatoValido: false,
        errorValidacion: 'Debe proporcionar un número de RUC o Cédula',
        existeEnSri: false,
        fuente: 'VALIDADOR_ALGORITMICO',
      };
    }

    // 1. Consumidor Final (9999999999999)
    if (identificacion === '9999999999999') {
      return {
        identificacion,
        tipoIdentificacion: '07',
        formatoValido: true,
        existeEnSri: true,
        estadoContribuyente: 'ACTIVO',
        razonSocial: 'CONSUMIDOR FINAL',
        fuente: 'SRI_CONSUMIDOR_FINAL',
        mensaje: 'Identificación estándar del SRI para Consumidor Final',
      };
    }

    // 2. Inferir tipo de identificación por longitud y formato
    const soloDigitos = /^\d+$/.test(identificacion);
    const tipoIdentificacion: '04' | '05' | '06' = soloDigitos
      ? identificacion.length === 10
        ? '05'
        : '04'
      : '06';

    // 3. Validación matemática (Módulo 10 / Módulo 11)
    const validacion = this.identificacionValidator.validar(
      tipoIdentificacion,
      identificacion,
    );

    if (!validacion.valido) {
      return {
        identificacion,
        tipoIdentificacion,
        formatoValido: false,
        errorValidacion: validacion.error,
        existeEnSri: false,
        fuente: 'VALIDADOR_ALGORITMICO',
        mensaje: validacion.error,
      };
    }

    // 4. Revisar caché en memoria (24h)
    const cached = this.memoryCache.get(identificacion);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    // 5. Buscar datos previos en BD local (emisores / comprobantes) para enriquecer email/teléfono/dirección
    const localData = await this.buscarEnBaseLocal(identificacion);

    // 6. Consultar Catastro Público del SRI
    // Si es RUC (13 dígitos) consulta directo; si es Cédula (10 dígitos) consulta con sufijo '001'
    const rucConsulta =
      tipoIdentificacion === '04'
        ? identificacion
        : tipoIdentificacion === '05'
          ? `${identificacion}001`
          : null;

    if (rucConsulta) {
      const sriResult = await this.consultarCatastroSriRemoto(rucConsulta);

      if (sriResult.reachable) {
        if (sriResult.existe && sriResult.contribuyente) {
          const c = sriResult.contribuyente;
          const result: ConsultaContribuyenteResult = {
            identificacion,
            tipoIdentificacion,
            formatoValido: true,
            existeEnSri: true,
            estadoContribuyente: c.estadoContribuyenteRuc || 'ACTIVO',
            razonSocial: c.razonSocial || localData?.razonSocial,
            nombreComercial:
              sriResult.nombreComercial || localData?.nombreComercial,
            direccionMatriz:
              sriResult.direccionMatriz || localData?.direccion,
            tipoContribuyente: c.tipoContribuyente,
            regimen: c.regimen,
            obligadoContabilidad:
              c.obligadoLlevarContabilidad === 'SI' ? 'SI' : 'NO',
            agenteRetencion: c.agenteRetencion,
            contribuyenteEspecial: c.contribuyenteEspecial,
            actividadEconomica: c.actividadEconomicaPrincipal,
            emailSugerido: localData?.email,
            telefonoSugerido: localData?.telefono,
            fuente: 'SRI_CATASTRO',
            mensaje:
              tipoIdentificacion === '05'
                ? 'Cédula válida verificada en Catastro SRI'
                : `RUC ${c.estadoContribuyenteRuc || 'ACTIVO'} verificado en Catastro SRI`,
          };

          this.memoryCache.set(identificacion, {
            expiresAt: Date.now() + ContribuyenteCatastroService.CACHE_TTL_MS,
            data: result,
          });
          return result;
        }

        // Si el usuario ingresó un RUC (04) y el catastro del SRI respondió explícitamente que NO existe
        if (tipoIdentificacion === '04' && !sriResult.existe) {
          // Si está registrado como emisor o comprador en BD local de pruebas, permitirlo con advertencia
          if (localData) {
            return {
              identificacion,
              tipoIdentificacion,
              formatoValido: true,
              existeEnSri: true,
              estadoContribuyente: 'ACTIVO (LOCAL)',
              razonSocial: localData.razonSocial,
              nombreComercial: localData.nombreComercial,
              direccionMatriz: localData.direccion,
              emailSugerido: localData.email,
              telefonoSugerido: localData.telefono,
              fuente: 'BD_LOCAL',
              mensaje: 'Contribuyente encontrado en registros locales',
            };
          }

          return {
            identificacion,
            tipoIdentificacion,
            formatoValido: true,
            existeEnSri: false,
            errorValidacion:
              'El RUC tiene formato válido pero NO consta registrado en el Catastro del SRI',
            fuente: 'SRI_CATASTRO',
            mensaje:
              'El RUC ingresado no existe en el Catastro del SRI Ecuador',
          };
        }
      }
    }

    // 7. Fallback para Cédulas sin RUC abierto o cuando el portal web del SRI no responde
    if (localData) {
      const fallbackLocal: ConsultaContribuyenteResult = {
        identificacion,
        tipoIdentificacion,
        formatoValido: true,
        existeEnSri: true,
        estadoContribuyente: 'ACTIVO',
        razonSocial: localData.razonSocial,
        nombreComercial: localData.nombreComercial,
        direccionMatriz: localData.direccion,
        emailSugerido: localData.email,
        telefonoSugerido: localData.telefono,
        fuente: 'BD_LOCAL',
        mensaje: 'Identificación válida (datos recuperados de base local)',
      };
      this.memoryCache.set(identificacion, {
        expiresAt: Date.now() + ContribuyenteCatastroService.CACHE_TTL_MS,
        data: fallbackLocal,
      });
      return fallbackLocal;
    }

    return {
      identificacion,
      tipoIdentificacion,
      formatoValido: true,
      existeEnSri: true,
      estadoContribuyente: 'VALIDADO',
      fuente: 'VALIDADOR_ALGORITMICO',
      mensaje:
        tipoIdentificacion === '05'
          ? 'Cédula ecuatoriana válida (Módulo 10 verificado)'
          : 'Identificación con estructura fiscal válida',
    };
  }

  /**
   * Valida al momento de emitir un comprobante que el RUC/Cédula del comprador sea válido
   * y, si es RUC (04), verifica su existencia en el Catastro del SRI.
   * También retorna la razón social oficial del SRI por si se desea autocompletar.
   */
  async validarCompradorEnEmision(
    tipoIdentificacion: string,
    identificacion: string,
  ): Promise<ConsultaContribuyenteResult | null> {
    if (tipoIdentificacion !== '04' && tipoIdentificacion !== '05') {
      return null;
    }

    const consulta = await this.consultarContribuyente(identificacion);
    if (!consulta.formatoValido) {
      throw new BadRequestException(
        `Identificación del comprador inválida: ${consulta.errorValidacion}`,
      );
    }

    if (
      tipoIdentificacion === '04' &&
      consulta.fuente === 'SRI_CATASTRO' &&
      !consulta.existeEnSri
    ) {
      throw new BadRequestException(
        `El RUC del comprador (${identificacion}) no existe en el Catastro del SRI.`,
      );
    }

    return consulta;
  }

  /**
   * Consulta los servicios REST públicos del Catastro del SRI
   */
  private async consultarCatastroSriRemoto(ruc: string): Promise<{
    reachable: boolean;
    existe: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contribuyente?: Record<string, any>;
    direccionMatriz?: string;
    nombreComercial?: string;
  }> {
    const headers = {
      Accept: 'application/json, text/plain, */*',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    };

    for (const baseUrl of ContribuyenteCatastroService.SRI_CATASTRO_BASES) {
      try {
        const existeUrl = `${baseUrl}/ConsolidadoContribuyente/existePorNumeroRuc?numeroRuc=${encodeURIComponent(ruc)}`;
        const existeResp = await axios.get(existeUrl, {
          headers,
          timeout: 4500,
        });

        const existe =
          existeResp.data === true || existeResp.data === 'true';
        if (!existe) {
          return { reachable: true, existe: false };
        }

        const detalleUrl = `${baseUrl}/ConsolidadoContribuyente/obtenerPorNumerosRuc?&ruc=${encodeURIComponent(ruc)}`;
        const detalleResp = await axios.get(detalleUrl, {
          headers,
          timeout: 4500,
        });

        const lista = Array.isArray(detalleResp.data)
          ? detalleResp.data
          : detalleResp.data
            ? [detalleResp.data]
            : [];

        if (lista.length === 0) {
          return { reachable: true, existe: false };
        }

        const contribuyente = lista[0];
        let direccionMatriz: string | undefined;
        let nombreComercial: string | undefined;

        try {
          const estabUrl = `${baseUrl}/Establecimiento/consultarPorNumeroRuc?numeroRuc=${encodeURIComponent(ruc)}`;
          const estabResp = await axios.get(estabUrl, {
            headers,
            timeout: 3500,
          });
          if (Array.isArray(estabResp.data) && estabResp.data.length > 0) {
            const matriz =
              estabResp.data.find(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (e: any) =>
                  e.matriz === 'SI' ||
                  e.tipoEstablecimiento === 'MAT' ||
                  e.numeroEstablecimiento === '001',
              ) || estabResp.data[0];
            direccionMatriz = matriz?.direccionCompleta || undefined;
            nombreComercial = matriz?.nombreFantasiaComercial || undefined;
          }
        } catch {
          // Establecimientos es opcional si ya obtuvimos el consolidado
        }

        return {
          reachable: true,
          existe: true,
          contribuyente,
          direccionMatriz,
          nombreComercial,
        };
      } catch (err) {
        this.logger.debug(
          `Catastro SRI (${baseUrl}) no disponible para ${ruc}: ${(err as Error).message}`,
        );
      }
    }

    return { reachable: false, existe: false };
  }

  /**
   * Busca si la identificación ya existe en las tablas locales de emisores o comprobantes
   */
  private async buscarEnBaseLocal(identificacion: string): Promise<{
    razonSocial: string;
    nombreComercial?: string;
    direccion?: string;
    email?: string;
    telefono?: string;
  } | null> {
    try {
      const rucCandidato =
        identificacion.length === 10 ? `${identificacion}001` : identificacion;

      const emisorRes = await this.db.query(
        `SELECT razon_social, nombre_comercial, direccion_matriz
         FROM emisores
         WHERE ruc = $1 OR ruc = $2
         LIMIT 1`,
        [identificacion, rucCandidato],
      );

      if (emisorRes.rows && emisorRes.rows.length > 0) {
        const row = emisorRes.rows[0];
        return {
          razonSocial: row.razon_social,
          nombreComercial: row.nombre_comercial || undefined,
          direccion: row.direccion_matriz || undefined,
        };
      }

      const compRes = await this.db.query(
        `SELECT razon_social_comprador, receptor_direccion, receptor_email, receptor_telefono
         FROM comprobantes
         WHERE identificacion_comprador = $1 OR identificacion_comprador = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [identificacion, rucCandidato],
      );

      if (compRes.rows && compRes.rows.length > 0) {
        const row = compRes.rows[0];
        return {
          razonSocial: row.razon_social_comprador,
          direccion: row.receptor_direccion || undefined,
          email: row.receptor_email || undefined,
          telefono: row.receptor_telefono || undefined,
        };
      }
    } catch {
      // Ignorar errores de consulta local en modo test/sin DB
    }

    return null;
  }
}
