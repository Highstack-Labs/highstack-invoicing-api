import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PdfService } from '../../pdf/pdf.service';
import { TemplateService } from '../../template/template.service';
import { SriRepositoryService } from './sri-repository.service';
import { TIPO_COMPROBANTE_DESCRIPCIONES } from '../constants';
import { Ambiente, TipoEmision, TipoIdentificacion } from '../constants/sri.enums';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

@Injectable()
export class RideService {
  private readonly logger = new Logger(RideService.name);
  private static readonly RIDE_TEMPLATE_ID = 'ride';

  constructor(
    private readonly pdfService: PdfService,
    private readonly templateService: TemplateService,
    private readonly repository: SriRepositoryService,
  ) {}

  /**
   * Genera el RIDE (PDF) de un comprobante por su clave de acceso
   */
  async generarRide(claveAcceso: string): Promise<Buffer> {
    this.logger.log(`Generando RIDE para clave: ${claveAcceso}`);

    const comprobante =
      await this.repository.findComprobanteConDetalles(claveAcceso);
    if (!comprobante) {
      throw new NotFoundException(
        `Comprobante ${claveAcceso} no encontrado`,
      );
    }

    const detalles =
      await this.repository.findDetallesByComprobanteId(comprobante.id);
    const totales =
      await this.repository.findTotalesByComprobanteId(comprobante.id);
    const impuestos =
      await this.repository.findImpuestosByComprobanteId(comprobante.id);
    const pagos =
      await this.repository.findPagosByComprobanteId(comprobante.id);
    const infoAdicional =
      await this.repository.findInfoAdicionalByComprobanteId(comprobante.id);

    const rideData = this.mapComprobanteToRideData(
      comprobante,
      detalles,
      totales,
      impuestos,
      pagos,
      infoAdicional,
    );

    try {
      const templatePath = this.templateService.findTemplate(
        RideService.RIDE_TEMPLATE_ID,
      );

      return await this.pdfService.generatePDF(
        rideData as AnyRecord,
        templatePath,
      );
    } catch (err) {
      this.logger.warn(
        `Usando generador RIDE PDF nativo (pdf-lib) para ${claveAcceso}: ${(err as Error).message}`,
      );
      return this.generarRidePdfNativo(rideData);
    }
  }

  /**
   * Genera el documento RIDE oficial del SRI directamente con pdf-lib
   * cuando el motor Carbone o la plantilla externa no están disponibles.
   */
  private async generarRidePdfNativo(rideData: AnyRecord): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

    const borderColor = rgb(0.78, 0.8, 0.84);
    const darkBg = rgb(0.95, 0.96, 0.97);
    const textPrimary = rgb(0.09, 0.09, 0.11);
    const textMuted = rgb(0.38, 0.4, 0.45);

    const sanitize = (str: unknown): string =>
      String(str ?? '')
        .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
        .trim();

    // 1. Cabecera Izquierda (Datos del Emisor)
    page.drawRectangle({
      x: 32,
      y: 635,
      width: 255,
      height: 170,
      borderColor,
      borderWidth: 1,
    });

    page.drawText(sanitize(rideData.razonSocialEmisor || 'EMISOR AUTORIZADO SRI').slice(0, 38), {
      x: 42,
      y: 782,
      size: 10,
      font: fontBold,
      color: textPrimary,
    });

    if (rideData.nombreComercial) {
      page.drawText(sanitize(rideData.nombreComercial).slice(0, 42), {
        x: 42,
        y: 767,
        size: 8.5,
        font,
        color: textMuted,
      });
    }

    page.drawText(`Dir. Matriz: ${sanitize(rideData.direccionMatriz || 'Ecuador').slice(0, 36)}`, {
      x: 42,
      y: 742,
      size: 8,
      font,
      color: textPrimary,
    });

    page.drawText(
      `Dir. Sucursal: ${sanitize(rideData.direccionEstablecimiento || rideData.direccionMatriz || 'Ecuador').slice(0, 34)}`,
      {
        x: 42,
        y: 726,
        size: 8,
        font,
        color: textPrimary,
      },
    );

    if (rideData.contribuyenteEspecial) {
      page.drawText(`Contribuyente Especial Nro: ${sanitize(rideData.contribuyenteEspecial)}`, {
        x: 42,
        y: 706,
        size: 8,
        font,
        color: textPrimary,
      });
    }

    page.drawText(`OBLIGADO A LLEVAR CONTABILIDAD: ${sanitize(rideData.obligadoContabilidad || 'NO')}`, {
      x: 42,
      y: 688,
      size: 8,
      font: fontBold,
      color: textPrimary,
    });

    if (rideData.contribuyenteRimpe === 'SI') {
      page.drawText('CONTRIBUYENTE RÉGIMEN RIMPE', {
        x: 42,
        y: 670,
        size: 8,
        font: fontBold,
        color: textMuted,
      });
    }

    // 2. Cabecera Derecha (Ficha Fiscal SRI y Clave de Acceso)
    page.drawRectangle({
      x: 297,
      y: 635,
      width: 266,
      height: 170,
      borderColor,
      borderWidth: 1,
    });

    page.drawText(`R.U.C.: ${sanitize(rideData.rucEmisor)}`, {
      x: 308,
      y: 786,
      size: 10,
      font: fontBold,
      color: textPrimary,
    });

    page.drawText(sanitize(rideData.tipoComprobanteDescripcion || 'FACTURA'), {
      x: 308,
      y: 769,
      size: 11,
      font: fontBold,
      color: textPrimary,
    });

    page.drawText(`No. ${sanitize(rideData.numeroComprobante)}`, {
      x: 308,
      y: 753,
      size: 9.5,
      font: fontMono,
      color: textPrimary,
    });

    page.drawText('NÚMERO DE AUTORIZACIÓN:', {
      x: 308,
      y: 736,
      size: 7.5,
      font: fontBold,
      color: textMuted,
    });

    page.drawText(sanitize(rideData.numAutorizacion || rideData.claveAcceso), {
      x: 308,
      y: 725,
      size: 6.4,
      font: fontMono,
      color: textPrimary,
    });

    page.drawText(
      `FECHA Y HORA AUTORIZACIÓN: ${sanitize(rideData.fechaAutorizacionFormato || rideData.fechaEmisionFormato)}`,
      {
        x: 308,
        y: 709,
        size: 7.5,
        font,
        color: textPrimary,
      },
    );

    page.drawText(
      `AMBIENTE: ${sanitize(rideData.ambienteDescripcion)}   |   EMISIÓN: ${sanitize(rideData.tipoEmisionDescripcion)}`,
      {
        x: 308,
        y: 694,
        size: 8,
        font: fontBold,
        color: textPrimary,
      },
    );

    page.drawText(`ESTADO SRI: ${sanitize(rideData.estado || 'AUTORIZADO')}`, {
      x: 308,
      y: 680,
      size: 8,
      font: fontBold,
      color: textPrimary,
    });

    page.drawText('CLAVE DE ACCESO:', {
      x: 308,
      y: 664,
      size: 7.5,
      font: fontBold,
      color: textMuted,
    });

    // Líneas de código de barras simuladas para la clave de 49 dígitos
    const claveStr = sanitize(rideData.claveAcceso);
    for (let i = 0; i < claveStr.length; i++) {
      const digit = Number(claveStr[i]) || 0;
      const barWidth = digit % 2 === 0 ? 1.5 : 0.8;
      page.drawRectangle({
        x: 308 + i * 4.8,
        y: 649,
        width: barWidth,
        height: 11,
        color: textPrimary,
      });
    }

    page.drawText(claveStr, {
      x: 308,
      y: 640,
      size: 6.4,
      font: fontMono,
      color: textPrimary,
    });

    // 3. Datos del Adquirente / Comprador
    page.drawRectangle({
      x: 32,
      y: 575,
      width: 531,
      height: 50,
      borderColor,
      borderWidth: 1,
      color: darkBg,
    });

    page.drawText(
      `Razón Social / Nombres y Apellidos: ${sanitize(rideData.razonSocialComprador).slice(0, 55)}`,
      {
        x: 42,
        y: 608,
        size: 8.5,
        font: fontBold,
        color: textPrimary,
      },
    );

    page.drawText(`Identificación: ${sanitize(rideData.identificacionComprador)}`, {
      x: 410,
      y: 608,
      size: 8.5,
      font: fontMono,
      color: textPrimary,
    });

    page.drawText(`Fecha de Emisión: ${sanitize(rideData.fechaEmisionFormato)}`, {
      x: 42,
      y: 588,
      size: 8,
      font,
      color: textPrimary,
    });

    page.drawText(
      `Dirección Comprador: ${sanitize(rideData.receptorDireccion || 'S/N').slice(0, 45)}`,
      {
        x: 230,
        y: 588,
        size: 8,
        font,
        color: textPrimary,
      },
    );

    // 4. Tabla de Detalles
    let yCursor = 548;
    page.drawRectangle({
      x: 32,
      y: yCursor,
      width: 531,
      height: 20,
      color: rgb(0.14, 0.15, 0.18),
    });

    const headerColor = rgb(1, 1, 1);
    page.drawText('CÓDIGO', { x: 38, y: yCursor + 6, size: 7.5, font: fontBold, color: headerColor });
    page.drawText('CANT.', { x: 110, y: yCursor + 6, size: 7.5, font: fontBold, color: headerColor });
    page.drawText('DESCRIPCIÓN', { x: 155, y: yCursor + 6, size: 7.5, font: fontBold, color: headerColor });
    page.drawText('P. UNITARIO', { x: 390, y: yCursor + 6, size: 7.5, font: fontBold, color: headerColor });
    page.drawText('DESC.', { x: 458, y: yCursor + 6, size: 7.5, font: fontBold, color: headerColor });
    page.drawText('SUBTOTAL', { x: 505, y: yCursor + 6, size: 7.5, font: fontBold, color: headerColor });

    const items = Array.isArray(rideData.detalles) && rideData.detalles.length > 0
      ? rideData.detalles
      : [
          {
            codigoPrincipal: 'SRV-001',
            cantidadFormato: '1.00',
            descripcion: `Comprobante Electrónico ${rideData.numeroComprobante}`,
            precioUnitarioFormato: rideData.subtotalFormato,
            descuentoFormato: '$0.00',
            subtotalFormato: rideData.subtotalFormato,
          },
        ];

    for (const item of items.slice(0, 14)) {
      yCursor -= 20;
      page.drawRectangle({
        x: 32,
        y: yCursor,
        width: 531,
        height: 20,
        borderColor,
        borderWidth: 0.5,
      });

      page.drawText(sanitize(item.codigoPrincipal || 'ITEM').slice(0, 12), {
        x: 38,
        y: yCursor + 6,
        size: 7.5,
        font: fontMono,
        color: textPrimary,
      });
      page.drawText(sanitize(item.cantidadFormato || '1.00'), {
        x: 110,
        y: yCursor + 6,
        size: 7.5,
        font: fontMono,
        color: textPrimary,
      });
      page.drawText(sanitize(item.descripcion || '').slice(0, 42), {
        x: 155,
        y: yCursor + 6,
        size: 7.5,
        font,
        color: textPrimary,
      });
      page.drawText(sanitize(item.precioUnitarioFormato || '$0.00'), {
        x: 392,
        y: yCursor + 6,
        size: 7.5,
        font: fontMono,
        color: textPrimary,
      });
      page.drawText(sanitize(item.descuentoFormato || '$0.00'), {
        x: 458,
        y: yCursor + 6,
        size: 7.5,
        font: fontMono,
        color: textPrimary,
      });
      page.drawText(sanitize(item.subtotalFormato || '$0.00'), {
        x: 505,
        y: yCursor + 6,
        size: 7.5,
        font: fontMono,
        color: textPrimary,
      });
    }

    // 5. Información Adicional y Resumen de Totales
    const summaryTop = yCursor - 16;

    // Caja Izquierda: Información Adicional & Forma de Pago
    page.drawRectangle({
      x: 32,
      y: summaryTop - 105,
      width: 310,
      height: 105,
      borderColor,
      borderWidth: 1,
    });

    page.drawText('INFORMACIÓN ADICIONAL Y FORMA DE PAGO', {
      x: 42,
      y: summaryTop - 16,
      size: 8,
      font: fontBold,
      color: textPrimary,
    });

    let infoY = summaryTop - 32;
    const infoList = Array.isArray(rideData.infoAdicional) ? rideData.infoAdicional : [];
    for (const info of infoList.slice(0, 3)) {
      page.drawText(`${sanitize(info.nombre)}: ${sanitize(info.valor).slice(0, 40)}`, {
        x: 42,
        y: infoY,
        size: 7.5,
        font,
        color: textPrimary,
      });
      infoY -= 14;
    }

    const pagosList = Array.isArray(rideData.pagos) && rideData.pagos.length > 0
      ? rideData.pagos
      : [{ formaPago: '20', formaPagoDescripcion: 'OTROS CON UTILIZACIÓN DEL SISTEMA FINANCIERO', totalFormato: rideData.totalFormato }];

    for (const p of pagosList.slice(0, 2)) {
      page.drawText(
        `Pago (${sanitize(p.formaPago)}): ${sanitize(p.formaPagoDescripcion).slice(0, 34)} - ${sanitize(p.totalFormato)}`,
        {
          x: 42,
          y: infoY,
          size: 7.5,
          font,
          color: textMuted,
        },
      );
      infoY -= 14;
    }

    // Caja Derecha: Cuadro de Totales
    page.drawRectangle({
      x: 354,
      y: summaryTop - 105,
      width: 209,
      height: 105,
      borderColor,
      borderWidth: 1,
      color: darkBg,
    });

    const drawTotalRow = (label: string, val: string, rowY: number, bold = false) => {
      page.drawText(label, {
        x: 364,
        y: rowY,
        size: bold ? 9 : 8,
        font: bold ? fontBold : font,
        color: textPrimary,
      });
      page.drawText(sanitize(val), {
        x: 505,
        y: rowY,
        size: bold ? 9 : 8,
        font: fontMono,
        color: textPrimary,
      });
    };

    drawTotalRow('SUBTOTAL SIN IMPUESTOS', rideData.subtotalFormato, summaryTop - 22);
    drawTotalRow('TOTAL DESCUENTO', rideData.totalDescuentoFormato, summaryTop - 40);
    drawTotalRow('IVA 15%', rideData.totalImpuestosFormato, summaryTop - 58);
    drawTotalRow('PROPINA', rideData.propinaFormato, summaryTop - 76);
    drawTotalRow('IMPORTE TOTAL', rideData.totalFormato, summaryTop - 95, true);

    // Pie de página
    page.drawText(
      'Representación Impresa de Comprobante Electrónico (RIDE) · Servicio de Rentas Internas del Ecuador (SRI)',
      {
        x: 32,
        y: 28,
        size: 7.5,
        font,
        color: textMuted,
      },
    );

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  /**
   * Mapea los datos del comprobante al formato requerido por el template RIDE
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapComprobanteToRideData(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    comprobante: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    detalles: any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    totales: any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    impuestos: any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pagos: any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    infoAdicional: any[],
  ): AnyRecord {
    const ambienteDesc =
      comprobante.ambiente === Ambiente.PRODUCCION
        ? 'PRODUCCI\u00d3N'
        : 'PRUEBAS';

    const tipoEmisionDesc =
      comprobante.tipo_emision === TipoEmision.CONTINGENCIA
        ? 'CONTINGENCIA'
        : 'NORMAL';

    const tipoCompDesc =
      TIPO_COMPROBANTE_DESCRIPCIONES[comprobante.tipo_comprobante] ||
      comprobante.tipo_comprobante;

    const subtotal = parseFloat(comprobante.subtotal) || 0;
    const totalDescuento = parseFloat(comprobante.total_descuento) || 0;
    const totalImpuestos = parseFloat(comprobante.total_impuestos) || 0;
    const total = parseFloat(comprobante.total) || 0;
    const propina = parseFloat(comprobante.propina) || 0;
    const moneda = comprobante.moneda === 'DOLAR' ? 'USD' : (comprobante.moneda || 'USD');

    // Group impuestos by detalle_id for embedding in detalles
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const impuestosByDetalle: Record<string, any[]> = {};
    for (const imp of impuestos) {
      const key = imp.comprobante_detalle_id;
      if (!impuestosByDetalle[key]) impuestosByDetalle[key] = [];
      impuestosByDetalle[key].push({
        codigo: imp.codigo || '',
        codigoPorcentaje: imp.codigo_porcentaje || '',
        tarifa: parseFloat(imp.tarifa) || 0,
        baseImponibleFormato: this.formatMoneda(parseFloat(imp.base_imponible) || 0, moneda),
        valorFormato: this.formatMoneda(parseFloat(imp.valor) || 0, moneda),
      });
    }

    return {
      // Emisor
      rucEmisor: comprobante.ruc_emisor || '',
      razonSocialEmisor: comprobante.razon_social_emisor || '',
      nombreComercial: comprobante.nombre_comercial || '',
      direccionMatriz: comprobante.direccion_matriz || '',
      direccionEstablecimiento: comprobante.direccion_establecimiento || comprobante.direccion_matriz || '',
      obligadoContabilidad: comprobante.obligado_contabilidad === true || comprobante.obligado_contabilidad === 'true' ? 'SI' : 'NO',
      contribuyenteEspecial: comprobante.contribuyente_especial || '',
      agenteRetencion: comprobante.agente_retencion === true || comprobante.agente_retencion === 'true' ? 'SI' : '',
      contribuyenteRimpe: comprobante.contribuyente_rimpe === true || comprobante.contribuyente_rimpe === 'true' ? 'SI' : '',

      // Comprobante
      tipoComprobanteDescripcion: tipoCompDesc,
      ambienteDescripcion: ambienteDesc,
      tipoEmisionDescripcion: tipoEmisionDesc,
      establecimiento: comprobante.establecimiento || '',
      puntoEmision: comprobante.punto_emision || '',
      secuencial: comprobante.secuencial || '',
      numeroComprobante: `${comprobante.establecimiento || ''}-${comprobante.punto_emision || ''}-${comprobante.secuencial || ''}`,
      fechaEmisionFormato: this.formatFecha(comprobante.fecha_emision),
      claveAcceso: comprobante.clave_acceso || '',
      estado: comprobante.estado || '',
      numAutorizacion: comprobante.num_autorizacion || '',
      fechaAutorizacionFormato: this.formatFecha(
        comprobante.fecha_autorizacion,
      ),

      // Comprador
      razonSocialComprador: comprobante.razon_social_comprador || '',
      identificacionComprador: comprobante.identificacion_comprador || '',
      tipoIdentificacionComprador: this.getTipoIdentificacionDesc(comprobante.receptor_tipo_identificacion),
      receptorDireccion: comprobante.receptor_direccion || '',
      receptorEmail: comprobante.receptor_email || '',
      receptorTelefono: comprobante.receptor_telefono || '',

      // Totales
      subtotalFormato: this.formatMoneda(subtotal, moneda),
      totalDescuentoFormato: this.formatMoneda(totalDescuento, moneda),
      totalImpuestosFormato: this.formatMoneda(totalImpuestos, moneda),
      propinaFormato: this.formatMoneda(propina, moneda),
      totalFormato: this.formatMoneda(total, moneda),
      moneda,

      // Detalles (items) con impuestos embebidos
      detalles: detalles.map((d) => ({
        codigoPrincipal: d.codigo_principal || '',
        codigoAuxiliar: d.codigo_auxiliar || '',
        descripcion: d.descripcion || '',
        cantidadFormato: this.formatNumero(parseFloat(d.cantidad) || 0),
        precioUnitarioFormato: this.formatMoneda(
          parseFloat(d.precio_unitario) || 0,
          moneda,
        ),
        descuentoFormato: this.formatMoneda(
          parseFloat(d.descuento) || 0,
          moneda,
        ),
        subtotalFormato: this.formatMoneda(
          parseFloat(d.precio_total_sin_impuesto) || 0,
          moneda,
        ),
        impuestos: impuestosByDetalle[d.id] || [],
      })),

      // Totales agrupados (impuestos)
      totales: totales.map((t) => ({
        codigo: t.codigo || '',
        descripcion: this.getImpuestoDescripcionConTarifa(t.codigo, t.codigo_porcentaje),
        codigoPorcentaje: t.codigo_porcentaje || '',
        tarifa: parseFloat(t.tarifa) || 0,
        baseImponibleFormato: this.formatMoneda(
          parseFloat(t.base_imponible) || 0,
          moneda,
        ),
        valorFormato: this.formatMoneda(parseFloat(t.valor) || 0, moneda),
      })),

      // Pagos
      pagos: pagos.map((p) => ({
        formaPago: p.forma_pago || '',
        formaPagoDescripcion: this.getFormaPagoDescripcion(p.forma_pago),
        totalFormato: this.formatMoneda(parseFloat(p.total) || 0, moneda),
        plazo: p.plazo ? String(p.plazo) : '',
        unidadTiempo: p.unidad_tiempo || '',
      })),

      // Info adicional
      infoAdicional: (infoAdicional || []).map((ia) => ({
        nombre: ia.nombre || '',
        valor: ia.valor || '',
      })),
    };
  }

  /**
   * Formatea una fecha al formato DD/MM/YYYY HH:mm:ss
   */
  private formatFecha(fecha: string | null | undefined): string {
    if (!fecha) return '';
    try {
      const date = new Date(fecha);
      if (isNaN(date.getTime())) return fecha;
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yyyy = date.getFullYear();
      const hh = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      const ss = String(date.getSeconds()).padStart(2, '0');
      return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
    } catch {
      return fecha;
    }
  }

  /**
   * Formatea un valor monetario
   */
  private formatMoneda(valor: number, moneda: string = 'USD'): string {
    const simbolo = moneda === 'USD' ? '$' : '';
    return `${simbolo}${valor.toFixed(2)}`;
  }

  /**
   * Formatea un número (cantidad)
   */
  private formatNumero(valor: number): string {
    return valor.toFixed(2);
  }

  /**
   * Descripción del impuesto según código SRI
   */
  private getImpuestoDescripcion(codigo: string): string {
    const descripciones: Record<string, string> = {
      '2': 'IVA',
      '3': 'ICE',
      '5': 'IRB',
    };
    return descripciones[codigo] || 'IMP';
  }

  /**
   * Descripción del impuesto con tarifa según código y códigoPorcentaje
   */
  private getImpuestoDescripcionConTarifa(codigo: string, codigoPorcentaje: string): string {
    const baseDesc = this.getImpuestoDescripcion(codigo);
    if (codigo === '2') {
      const tarifas: Record<string, string> = {
        '0': 'IVA 0%',
        '2': 'IVA 12%',
        '3': 'IVA 14%',
        '4': 'IVA 15%',
        '5': 'IVA 5%',
        '6': 'No Objeto de Impuesto',
        '7': 'Exento de IVA',
        '8': 'IVA Diferenciado',
      };
      return tarifas[codigoPorcentaje] || baseDesc;
    }
    return baseDesc;
  }

  /**
   * Descripción del tipo de identificación según código SRI
   */
  private getTipoIdentificacionDesc(codigo: string | null | undefined): string {
    if (!codigo) return '';
    const descripciones: Record<string, string> = {
      [TipoIdentificacion.RUC]: 'RUC',
      [TipoIdentificacion.CEDULA]: 'CÉDULA',
      [TipoIdentificacion.PASAPORTE]: 'PASAPORTE',
      [TipoIdentificacion.CONSUMIDOR_FINAL]: 'CONSUMIDOR FINAL',
      [TipoIdentificacion.IDENTIFICACION_EXTERIOR]: 'IDENTIFICACIÓN EXTERIOR',
      [TipoIdentificacion.PLACA]: 'PLACA',
    };
    return descripciones[codigo] || codigo;
  }

  /**
   * Descripción de la forma de pago según código SRI
   */
  private getFormaPagoDescripcion(codigo: string | null | undefined): string {
    if (!codigo) return '';
    const descripciones: Record<string, string> = {
      '01': 'SIN UTILIZACIÓN DEL SISTEMA FINANCIERO',
      '15': 'COMPENSACIÓN DE DEUDAS',
      '16': 'TARJETA DE DÉBITO',
      '17': 'DINERO ELECTRÓNICO',
      '18': 'TARJETA PREPAGO',
      '19': 'TARJETA DE CRÉDITO',
      '20': 'OTROS CON UTILIZACIÓN DEL SISTEMA FINANCIERO',
      '21': 'ENDOSO DE TÍTULOS',
    };
    return descripciones[codigo] || codigo;
  }
}
