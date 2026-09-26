import { addstyles, customElement, JSXElement, state } from "@tiddlywiki/jsx-lit";
import refreshIcon from "@material-symbols/svg-400/outlined/refresh.svg";
import { MaterialSymbol } from "./material-symbol";
import { t } from "./i18n";

export type LoginEmojiPuzzleProps = {
  onSolvedChange?: (solved: boolean) => void;
};

type EmojiTile = { id: string; emoji: string; isAnimal: boolean };

const ANIMAL_POOL = ["🦊", "🐱", "🐶", "🐼", "🦁", "🐵", "🐰", "🐸", "🦉"];
const NON_ANIMAL_POOL = ["🍎", "🍌", "🍕", "☕", "🎂", "⚽", "🚗", "🌵", "📱", "⭐", "🎈", "🌸", "🚲", "🍦"];

const shuffle = <T,>(items: T[]): T[] => {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

const buildBoard = (): EmojiTile[] => {
  const animals = shuffle(ANIMAL_POOL).slice(0, 3).map((emoji) => ({ id: `animal-${emoji}`, emoji, isAnimal: true }));
  const others = shuffle(NON_ANIMAL_POOL).slice(0, 6).map((emoji) => ({ id: `other-${emoji}`, emoji, isAnimal: false }));
  return shuffle([...animals, ...others]);
};

@addstyles(`
:host { display: contents; }
`)
@customElement("mws-login-emoji-puzzle")
export class LoginEmojiPuzzle extends JSXElement {
  useLightDOM: boolean = true;

  @state() accessor props: LoginEmojiPuzzleProps = {};
  @state() private accessor tiles: EmojiTile[] = buildBoard();
  @state() private accessor selected = new Set<string>();
  @state() private accessor solved = false;
  @state() private accessor hasError = false;
  @state() private accessor wrongEmoji = "";

  private resetTimer: number | null = null;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.resetTimer !== null) window.clearTimeout(this.resetTimer);
  }

  private readonly pushSolved = (solved: boolean) => {
    this.props?.onSolvedChange?.(solved);
    this.dispatchEvent(new CustomEvent<boolean>("solvedchange", { detail: solved, bubbles: true, composed: true }));
  };

  private readonly resetBoard = () => {
    if (this.resetTimer !== null) window.clearTimeout(this.resetTimer);
    this.selected = new Set<string>();
    this.solved = false;
    this.hasError = false;
    this.wrongEmoji = "";
    this.tiles = buildBoard();
    this.pushSolved(false);
  };

  private readonly toggleTile = (tile: EmojiTile) => {
    if (this.solved) return;
    if (this.resetTimer !== null) {
      window.clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    if (!tile.isAnimal) {
      this.wrongEmoji = tile.emoji;
      this.hasError = true;
      this.resetTimer = window.setTimeout(() => {
        this.selected = new Set<string>();
        this.wrongEmoji = "";
        this.hasError = false;
        this.resetTimer = null;
      }, 700);
      return;
    }

    this.wrongEmoji = "";
    this.hasError = false;

    const next = new Set(this.selected);
    if (next.has(tile.emoji)) {
      next.delete(tile.emoji);
      this.selected = next;
      return;
    }
    next.add(tile.emoji);
    this.selected = next;

    if (next.size === this.tiles.filter((candidate) => candidate.isAnimal).length) {
      this.solved = true;
      this.pushSolved(true);
    }
  };

  protected render() {
    const animalCount = this.tiles.filter((candidate) => candidate.isAnimal).length;
    return (
      <div class={`emoji-puzzle${this.hasError ? " is-shaking" : ""}`}>
        <div class="emoji-puzzle-head">
          <span class="emoji-puzzle-task">{t("Tap all the animals")}</span>
          <button
            class="emoji-puzzle-refresh"
            type="button"
            title={t("New puzzle")}
            aria-label={t("New puzzle")}
            onclick={this.resetBoard}
          >
            <MaterialSymbol icon={refreshIcon} />
          </button>
        </div>
        <div class="emoji-puzzle-grid" role="group" aria-label={t("Tap all the animals")}>
          {this.tiles.map((tile) => {
            const isSelected = this.selected.has(tile.emoji);
            const isWrong = this.hasError && tile.emoji === this.wrongEmoji;
            const isSolved = this.solved && tile.isAnimal;
            return (
              <button
                class={`emoji-puzzle-tile${isSelected ? " is-selected" : ""}${isWrong ? " is-wrong" : ""}${isSolved ? " is-solved" : ""}`}
                type="button"
                aria-pressed={isSelected}
                onclick={() => this.toggleTile(tile)}
              >
                <span aria-hidden="true">{tile.emoji}</span>
              </button>
            );
          })}
        </div>
        <p class="emoji-puzzle-feedback" role="status" aria-live="polite">
          {this.solved
            ? <span class="is-solved-text">{t("Well done! You are definitely human.")}</span>
            : this.hasError
              ? <span class="is-wrong-text">{t("That is not an animal.")}</span>
              : <span>{t("Find all {count} animals.", { count: animalCount })}</span>}
        </p>
      </div>
    );
  }
}