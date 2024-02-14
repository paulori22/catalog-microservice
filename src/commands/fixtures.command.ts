import {DefaultCrudRepository} from '@loopback/repository';
import {default as chalk} from 'chalk';
import {CatalogMicroserviceApplication} from '../application';
import {config} from '../config';
import {Esv7DataSource} from '../datasources';
import fixtures from '../fixtures';
import {ValidatorService} from '../services/validator.service';
import {BaseCommand} from './base.commands';

export class FixturesCommand extends BaseCommand {
  static command = 'fixtures';
  static description = 'Fixtures data in Elasticsearch';

  app: CatalogMicroserviceApplication;

  async run() {
    console.log(chalk.green('Fixture data'));
    await this.bootApp();
    console.log(chalk.green('Deleting all documents'));
    const datasource: Esv7DataSource = this.app.getSync('datasource.esv7');
    await datasource.deleteAllDocuments();
    console.log(chalk.green('Deleted all documents'));
    console.log(chalk.green('Creating documents'));
    await this.populateFakeData();
    console.log(chalk.green('Created documents'));
  }

  private async bootApp() {
    this.app = new CatalogMicroserviceApplication(config);
    await this.app.boot();
  }

  private async populateFakeData() {
    const validator = this.app.getSync<ValidatorService>(
      'services.ValidatorService',
    );
    for (const fixture of fixtures) {
      const repository = this.getRepository<DefaultCrudRepository<any, any>>(
        fixture.model,
      );
      await validator.validate({
        data: fixture.fields,
        entityClass: repository.entityClass,
      });
      await repository.create(fixture.fields);
    }
  }

  private getRepository<T>(modelName: string): T {
    return this.app.getSync(`repositories.${modelName}Repository`);
  }
}
