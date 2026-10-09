import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { KnowledgeScopeService } from './knowledge-scope.service';
import { AssetController } from './asset/asset.controller';
import { AssetService } from './asset/asset.service';
import { AssetStateService } from './asset/asset-state.service';
import { DocumentController } from './document/document.controller';
import { DocumentService } from './document/document.service';
import { DocumentStateService } from './document/document-state.service';

/**
 * Modulo raiz de activos y documentos de Fase 6 (design §3.1), analogo a
 * coordination: dos submodulos de SERVICE (asset/document) que comparten
 * KnowledgeScopeService (alcance por rol) y las maquinas de estado minimas.
 * Importa PrismaModule/AuthModule/AuditModule como el resto de modulos.
 *
 * Orden de controllers (design §3.1): las rutas estaticas (/assets, /documents)
 * preceden a las parametricas por recurso, por lo que no colisionan;
 * AssetController se registra primero por precaucion de routing.
 */
@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [AssetController, DocumentController],
  providers: [
    KnowledgeScopeService,
    AssetStateService,
    DocumentStateService,
    AssetService,
    DocumentService,
  ],
})
export class KnowledgeModule {}
