import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { SriController } from './sri.controller';
import { CatalogosController } from './catalogos.controller';
import { SriService } from './sri.service';
import {
  ClaveAccesoService,
  XmlBuilderService,
  XmlSignerService,
  SriSoapFactoryService,
  SriSoapClient,
  IdentificacionValidatorService,
  CatalogoValidatorService,
  SriBaseService,
  FacturaService,
  NotaCreditoService,
  NotaDebitoService,
  RetencionService,
  GuiaRemisionService,
} from './services';
import { SriRepositoryService } from './services/sri-repository.service';
import { XmlStorageService } from './services/xml-storage.service';
import { EmisoresModule } from '../emisores/emisores.module';
import { PdfModule } from '../pdf/pdf.module';
import { TemplateModule } from '../template/template.module';
import { SriEmisionProcessor } from './processors/sri-emision.processor';
import { RideService } from './services/ride.service';
import { ContribuyenteCatastroService } from './services/contribuyente-catastro.service';

@Module({
  imports: [
    ConfigModule,
    EmisoresModule,
    PdfModule,
    TemplateModule,
    BullModule.registerQueue({ name: 'sri-emision' }),
  ],
  controllers: [SriController, CatalogosController],
  providers: [
    SriService,
    SriBaseService,
    FacturaService,
    NotaCreditoService,
    NotaDebitoService,
    RetencionService,
    GuiaRemisionService,
    SriRepositoryService,
    XmlStorageService,
    ClaveAccesoService,
    XmlBuilderService,
    XmlSignerService,
    SriSoapFactoryService,
    SriSoapClient,
    IdentificacionValidatorService,
    CatalogoValidatorService,
    SriEmisionProcessor,
    RideService,
    ContribuyenteCatastroService,
  ],
  exports: [
    SriService,
    SriBaseService,
    FacturaService,
    NotaCreditoService,
    NotaDebitoService,
    RetencionService,
    GuiaRemisionService,
    SriRepositoryService,
    XmlStorageService,
    ClaveAccesoService,
    XmlBuilderService,
    XmlSignerService,
    SriSoapFactoryService,
    CatalogoValidatorService,
    RideService,
    ContribuyenteCatastroService,
  ],
})
export class SriModule {}
