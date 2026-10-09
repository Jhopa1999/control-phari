import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { KnowledgeModule } from './knowledge.module';
import { KnowledgeScopeService } from './knowledge-scope.service';
import { AssetController } from './asset/asset.controller';
import { AssetService } from './asset/asset.service';
import { AssetStateService } from './asset/asset-state.service';
import { DocumentController } from './document/document.controller';
import { DocumentService } from './document/document.service';
import { DocumentStateService } from './document/document-state.service';

/**
 * Contrato de registro del modulo knowledge (patron coordination.module.spec.ts):
 * los 2 controllers y sus services (mas el scope y las maquinas de estado) estan
 * registrados. AssetController se registra primero por precaucion de routing
 * (design §3.1).
 */
describe('KnowledgeModule', () => {
  const controllers: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, KnowledgeModule) ?? [];
  const providers: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.PROVIDERS, KnowledgeModule) ?? [];

  it('registra los 2 controllers', () => {
    expect(controllers).toContain(AssetController);
    expect(controllers).toContain(DocumentController);
  });

  it('registra AssetController primero (precaucion de routing, §3.1)', () => {
    expect(controllers[0]).toBe(AssetController);
  });

  it('registra el scope, las maquinas de estado y los services de dominio', () => {
    expect(providers).toContain(KnowledgeScopeService);
    expect(providers).toContain(AssetStateService);
    expect(providers).toContain(DocumentStateService);
    expect(providers).toContain(AssetService);
    expect(providers).toContain(DocumentService);
  });
});
