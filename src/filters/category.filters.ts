import {Category} from '../models';
import {DefaultFilter} from './default-filter';

export class CategoryFilterBuilder extends DefaultFilter<Category> {
  protected defaultFilter(): void | DefaultFilter<Category> {
    return this.isActive(Category);
  }
}
