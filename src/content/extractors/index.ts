import type { Article } from '../../lib/messages';
import * as nature from './nature';
import * as cell from './cell';
import * as science from './science';
import * as sd from './sciencedirect';
import * as wiley from './wiley';
import * as springer from './springer';
import * as pnas from './pnas';
import * as plos from './plos';
import * as generic from './generic';

const REGISTRY = [nature, cell, science, sd, wiley, springer, pnas, plos];

export function extractArticle(): Article {
  const url = new URL(location.href);
  for (const ex of REGISTRY) {
    try {
      if (ex.matches(url)) return ex.extract();
    } catch (e) {
      console.warn('[paper-ai] extractor failed', ex.id, e);
    }
  }
  return generic.extract();
}
