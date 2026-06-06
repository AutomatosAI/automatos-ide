import { Card } from '../cards/card';
import { parseCard } from '../cards/frontmatter';
import { CARD_STATUSES } from '../cards/status';
import { Board, buildBoard } from './board';
import { folderPath, isCardFile } from './layout';
import { FileStore } from '../../fs/fileStore';

/**
 * Read the whole queue off disk and group it into a {@link Board} (13 §2).
 *
 * Walk every status folder, parse the card files, and let {@link buildBoard} regroup them
 * by their frontmatter `status` — which is the source of truth, NOT the folder a card
 * physically sits in (14 §2.1). A card mid-transition can momentarily appear in two
 * folders; dedupe-by-LWW inside buildBoard collapses it. One malformed file is skipped,
 * never fatal — a single bad card must not blank the cockpit.
 */
export async function readBoard(store: FileStore): Promise<Board> {
  const cards: Card[] = [];
  for (const status of CARD_STATUSES) {
    const dir = folderPath(status);
    for (const name of await store.list(dir)) {
      if (!isCardFile(name)) {
        continue;
      }
      try {
        cards.push(parseCard(await store.read(`${dir}/${name}`)));
      } catch {
        // a malformed card file is skipped, not fatal to the board
      }
    }
  }
  return buildBoard(cards);
}
