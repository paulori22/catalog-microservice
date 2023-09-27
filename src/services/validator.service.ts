import {BindingScope, bind, inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {
  AjvFactory,
  RestBindings,
  getModelSchemaRef,
  validateRequestBody,
} from '@loopback/rest';
import {CategoryRepository} from '../repositories';

interface ValidateOptions<T> {
  data: object;
  entityClass: Function & {prototype: T};
}

@bind({scope: BindingScope.SINGLETON})
export class ValidatorService {
  cache = new Map();

  constructor(
    @repository(CategoryRepository) private repo: CategoryRepository,
    @inject(RestBindings.AJV_FACTORY) private ajvFactory: AjvFactory,
  ) {}

  async validate<T extends object>({data, entityClass}: ValidateOptions<T>) {
    const modelShema = getModelSchemaRef(entityClass);
    if (!modelShema) {
      const error = new Error('The parameter entityClass is not a entity');
      error.name = 'NotEntityClass';
      throw error;
    }
    const schemaRef = {$ref: modelShema.$ref};
    const schemaName = Object.keys(modelShema.definitions)[0];
    if (!this.cache.has(schemaName)) {
      this.cache.set(schemaName, modelShema.definitions[schemaName]);
    }

    const globalSchemas = Array.from(this.cache).reduce<any>(
      (obj, [key, value]) => {
        obj[key] = value;
        return obj;
      },
      {},
    );

    await validateRequestBody(
      {value: data, schema: schemaRef},
      {required: true, content: {}},
      globalSchemas,
      {ajvFactory: this.ajvFactory},
    );
  }
}
