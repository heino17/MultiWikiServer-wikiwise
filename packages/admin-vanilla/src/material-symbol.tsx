import { customElement, JSXElement, addstyles, state } from "@tiddlywiki/jsx-lit";

// import icon1 from "@material-symbols/svg-400/{style}/{icon}.svg" // (Unfilled)
// import icon2 from "@material-symbols/svg-400/{style}/{icon}-fill.svg" // (Filled)
// <MaterialSymbol icon={icon} />
@customElement("material-symbol")
export class MaterialSymbol extends JSXElement {
  useLightDOM: boolean = true;

  @state() accessor props!: {
    icon: string;
  }

  protected render() {
    // Strip width/height from SVG so it scales via CSS
    const svg = this.props.icon
      .replace(/\swidth="[^"]*"/, "")
      .replace(/\sheight="[^"]*"/, "");
    this.innerHTML = svg;
    return JSXElement.DO_NOT_RENDER;
  }
}
