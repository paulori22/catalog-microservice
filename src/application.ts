import {BootMixin} from '@loopback/boot';
import {Application, ApplicationConfig} from '@loopback/core';
import {RepositoryMixin} from '@loopback/repository';
import {RestBindings, RestComponent, RestServer} from '@loopback/rest';
import {RestExplorerBindings} from '@loopback/rest-explorer';
import {ServiceMixin} from '@loopback/service-proxy';
import path from 'path';
import {
  EntityComponent,
  RestExplorerComponent,
  ValidatorsComponent,
} from './components';
import {ApiResourceProvider} from './providers/api-resource.provider';
import {MySequence} from './sequence';
import {RabbitmqServer} from './servers/rabbitmq.server';

export {ApplicationConfig};

export class CatalogMicroserviceApplication extends BootMixin(
  ServiceMixin(RepositoryMixin(Application)),
) {
  constructor(options: ApplicationConfig = {}) {
    super(options);

    options.rest.sequence = MySequence;
    this.component(RestComponent);
    const restServer = this.getSync<RestServer>('servers.RestServer');
    restServer.static('/', path.join(__dirname, '../public'));

    // Customize @loopback/rest-explorer configuration here
    this.configure(RestExplorerBindings.COMPONENT).to({
      path: '/explorer',
    });
    this.bind(RestBindings.SequenceActions.SEND).toProvider(
      ApiResourceProvider,
    );
    this.component(RestExplorerComponent);
    this.component(ValidatorsComponent);
    this.component(EntityComponent);
    this.projectRoot = __dirname;
    // Customize @loopback/boot Booter Conventions here
    this.bootOptions = {
      controllers: {
        // Customize ControllerBooter Conventions here
        dirs: ['controllers'],
        extensions: ['.controller.js'],
        nested: true,
      },
    };

    this.servers([RabbitmqServer]);
  }

  /*   async boot() {
    await super.boot();

    const validator = this.getSync<ValidatorService>(
      'services.ValidatorService',
    );
    try {
      await validator.validate({
        data: {
          id: '12',
        },
        entityClass: Category,
      });
    } catch (error) {
      console.dir(error, {depth: 8});
    }
  } */
}
