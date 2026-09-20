import { customElement, JSXElement, state } from "@tiddlywiki/jsx-lit";
import { t } from "./i18n";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 32;
export const PASSWORD_DEFAULT_LENGTH = 16;

const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%&*";
const ALL = UPPERCASE + LOWERCASE + DIGITS + SYMBOLS;
const CHARSET_POOL_SIZE = UPPERCASE.length + LOWERCASE.length + DIGITS.length + SYMBOLS.length; // 70 possible characters
const MAX_ENTROPY = PASSWORD_MAX_LENGTH * Math.log2(CHARSET_POOL_SIZE);

/** Entropy thresholds (bits) that decide the strength color of the bar. */
const STRENGTH_LEVELS: readonly { max: number; className: string }[] = [
  { max: 50, className: "entropy-very-weak" },
  { max: 90, className: "entropy-weak" },
  { max: 130, className: "entropy-medium" },
  { max: 170, className: "entropy-strong" },
  { max: Infinity, className: "entropy-very-strong" },
];

export function getEntropy(length: number): number {
  const clamped = Math.min(PASSWORD_MAX_LENGTH, Math.max(PASSWORD_MIN_LENGTH, Math.floor(length) || PASSWORD_DEFAULT_LENGTH));
  return clamped * Math.log2(CHARSET_POOL_SIZE);
}

function getStrengthClass(entropy: number): string {
  return STRENGTH_LEVELS.find((level) => entropy < level.max)!.className;
}

/** Random index in [0, count) using crypto.getRandomValues (rejection-free: count <= 256). */
function randomIndex(count: number): number {
  const byte = new Uint8Array(1);
  globalThis.crypto.getRandomValues(byte);
  return byte[0] % count;
}

/**
 * Generates a random password of the requested length (clamped to
 * PASSWORD_MIN_LENGTH..PASSWORD_MAX_LENGTH) with at least one uppercase
 * letter, one lowercase letter, one digit and one symbol. The remaining
 * slots are filled uniformly from the full character set, then shuffled.
 */
export function generatePassword(length: number): string {
  const clamped = Math.min(PASSWORD_MAX_LENGTH, Math.max(PASSWORD_MIN_LENGTH, Math.floor(length) || PASSWORD_DEFAULT_LENGTH));
  const chars = [
    UPPERCASE[randomIndex(UPPERCASE.length)],
    LOWERCASE[randomIndex(LOWERCASE.length)],
    DIGITS[randomIndex(DIGITS.length)],
    SYMBOLS[randomIndex(SYMBOLS.length)],
  ];
  while (chars.length < clamped) chars.push(ALL[randomIndex(ALL.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export interface PasswordGeneratorProps {
  /** Field key the generated password is written into. */
  fieldKey: string;
  /** Optional confirm-field key to fill with the same value. */
  confirmKey?: string;
  disabled?: boolean;
  onDraftChange: (key: string, value: string) => void;
  onTriggerOperation?: (key: string, value: string) => void;
}

/**
 * Button + length selector that produces a random password (shown in clear
 * text for copy/paste) and fills the associated password field(s).
 */
@customElement("mws-password-generator")
export class PasswordGenerator extends JSXElement {
  useLightDOM: boolean = true;

  @state() accessor props!: PasswordGeneratorProps;

  @state() accessor length: number = PASSWORD_DEFAULT_LENGTH;
  @state() accessor generated: string = "";

  private readonly handleGenerate = () => {
    const password = generatePassword(this.length);
    const { fieldKey, confirmKey, onDraftChange, onTriggerOperation } = this.props;
    onDraftChange(fieldKey, password);
    if (confirmKey) {
      onDraftChange(confirmKey, password);
      onTriggerOperation?.(confirmKey, password);
    }
    this.generated = password;
  };

  protected render() {
    const { disabled } = this.props;
    const entropy = getEntropy(this.length);
    const strengthClass = getStrengthClass(entropy);
    const fillPercent = Math.min(100, (entropy / MAX_ENTROPY) * 100);
    return (
      <div class="password-generator">
        <div class="password-generator-row">
          <button
            class="ghost-button password-generator-button"
            type="button"
            disabled={disabled}
            onclick={this.handleGenerate}
            title={t("Generate password")}
          >
            <span class="password-generator-dice" aria-hidden="true">🎲</span>
            <span>{t("Generate password")}</span>
          </button>
          <label class="password-generator-length">
            <span>{t("Length")}</span>
            <input
              class="field-input password-generator-length-input"
              type="number"
              min={PASSWORD_MIN_LENGTH}
              max={PASSWORD_MAX_LENGTH}
              value={String(this.length)}
              disabled={disabled}
              oninput={(event) => {
                const element = event.currentTarget as HTMLInputElement;
                let next = Number(element.value);
                if (!Number.isFinite(next) || Number.isNaN(next)) {
                  this.length = PASSWORD_DEFAULT_LENGTH;
                  return;
                }
                const clamped = Math.min(PASSWORD_MAX_LENGTH, Math.max(PASSWORD_MIN_LENGTH, Math.floor(next) || PASSWORD_DEFAULT_LENGTH));
                if (next > PASSWORD_MAX_LENGTH || next < PASSWORD_MIN_LENGTH) {
                  element.value = String(clamped);
                  next = clamped;
                }
                this.length = clamped;
              }}
            />
          </label>
          <output class="password-generator-entropy" aria-live="polite">
            {t("Entropy: {value} bit", { value: entropy.toFixed(2) })}
          </output>
          <div
            class={`password-generator-strength ${strengthClass}`}
            role="img"
            aria-label={t("Password strength")}
            title={t("Password strength")}
          >
            <div class="password-generator-strength-fill" style={`width: ${fillPercent.toFixed(1)}%`}></div>
          </div>
        </div>
        {this.generated ? (
          <output class="password-generator-output" aria-live="polite">
            {this.generated}
          </output>
        ) : null}
      </div>
    );
  }
}