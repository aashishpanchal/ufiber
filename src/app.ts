import uws from '../uws';
import {Router} from './router';
import type {Target} from './types';

type Options = {
  router?: Target;
} & uws.AppOptions;

export class Fiver extends Router {
  constructor(opt?: Options) {
    super(opt?.router);
  }

  listen(...args: any[]) {}
}
