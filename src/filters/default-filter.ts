import {
  AnyObject,
  Filter,
  FilterBuilder,
  JsonSchema,
  Model,
  Where,
  WhereBuilder,
} from '@loopback/repository';
import {getJsonSchema} from '@loopback/rest';
import {clone} from 'lodash';

export abstract class DefaultFilter<
  MT extends object = AnyObject,
> extends FilterBuilder<MT> {
  defaultWhere: Where<MT> | null | undefined;
  constructor(f?: Filter<MT>) {
    super(f);
    const dFilter = this.defaultFilter();
    this.defaultWhere = dFilter ? clone(dFilter.filter.where) : null;
    this.filter.where = {};
  }

  protected defaultFilter(): DefaultFilter<MT> | void {}

  isActive(modelCtro: typeof Model) {
    this.filter.where = new WhereBuilder<{is_active: boolean}>(
      this.filter.where,
    )
      .eq('is_active', true)
      .build() as Where<MT>;
    this.isActiveRelations(modelCtro);

    return this;
  }

  isActiveRelations(modelCtro: typeof Model) {
    const relations: string[] = Object.keys(modelCtro.definition.relations);
    if (!relations.length) {
      return this;
    }
    const schema = getJsonSchema(modelCtro);
    const relationsFiltered = relations.filter(r => {
      const jsonSchema = schema.properties?.[r] as JsonSchema;
      if (
        !jsonSchema ||
        (jsonSchema.type !== 'array' && jsonSchema.type !== 'object')
      ) {
        return false;
      }
      const properties =
        (jsonSchema.items as any).properties || jsonSchema.properties;
      return Object.keys(properties).includes('is_active');
    });

    const whereStr = JSON.stringify(this.filter.where);
    const regex = new RegExp(
      `${relationsFiltered.map(r => `${r}.*`).join('|')}`,
      'g',
    );

    const matches = whereStr.match(regex);
    if (!matches) {
      return this;
    }
    const fields = matches.map(m => {
      const relation = m.split('.')[0];
      return {[`${relation}.is_active`]: true};
    });
    this.filter.where = new WhereBuilder<{is_active: boolean}>(
      this.filter.where,
    )
      .and(fields)
      .build() as Where<MT>;
    return this;
  }

  build(): Filter<MT> {
    return this.defaultWhere
      ? this.impose(this.defaultWhere).filter
      : this.filter;
  }
}
