// ODT document preview: renders the HTML fragment produced by odf-kit into a
// sandboxed iframe. A dedicated element is used (instead of a bare `srcdoc`
// attribute) because this project's JSX layer sets attributes via
// setAttribute(), which would re-parse (and mangle) the HTML string; assigning
// `iframe.srcdoc` as a property keeps the markup byte-for-byte intact.

import { customElement, JSXElement, state } from "@tiddlywiki/jsx-lit";

const DOCUMENT_CSS = `\
html,body{margin:0;padding:0}
body{font-family:Georgia,'Times New Roman','Liberation Serif',serif;font-size:14px;line-height:1.55;padding:2rem 1.6rem;word-wrap:break-word}
body.mws-light{background:#fff;color:#1f1f1f}
body.mws-dark{background:#1e1e1e;color:#e6e6e6}
h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1rem 0 .5rem}
p{margin:.35rem 0}
table{border-collapse:collapse;width:100%;margin:.6rem 0}
td,th{border:1px solid #ccc;padding:.35rem .6rem;text-align:left}
body.mws-dark td,body.mws-dark th{border-color:#4a4a4a}
img{max-width:100%;height:auto}
a{color:#1a6fb2}
ul,ol{padding-left:1.4rem;margin:.35rem 0}
hr{border:none;border-top:1px solid #ccc;margin:1rem 0}
body.mws-dark hr{border-top-color:#4a4a4a}
`;

const mkDocument = (html: string, dark: boolean): string =>
  "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><style>" + DOCUMENT_CSS + "</style></head>" +
  "<body class=\"" + (dark ? "mws-dark" : "mws-light") + "\">" + html + "</body></html>";

@customElement("odt-preview-document")
export class OdtPreviewDocument extends JSXElement {
  useLightDOM: boolean = true;

  @state() accessor props!: {
    html: string;
    dark?: boolean;
  }

  protected render() {
    const frame = document.createElement("iframe");
    frame.className = "user-files-preview-iframe";
    frame.setAttribute("sandbox", "");
    frame.srcdoc = mkDocument(this.props.html, Boolean(this.props.dark));
    this.innerHTML = "";
    this.appendChild(frame);
    return JSXElement.DO_NOT_RENDER;
  }
}