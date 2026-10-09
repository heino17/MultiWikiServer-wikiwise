// The admin shell's menus are native <details> elements: an open menu closes
// when its summary is clicked again, and only then. A click into the free
// space must close it too (§117). Menus are matched by their dropdown classes;
// the <details> accordions in the wiki-file-import dialog are content
// expanders and are deliberately not part of this.
export const MENU_DETAILS_SELECTOR =
  "details.hero-locale-menu[open], details.hero-account-menu[open], details.create-wiki-menu[open]";

/** Closes every open admin menu that does not contain the click target.
 *  Runs in the capture phase, so an open menu already closes before whatever
 *  element was really clicked gets its own handler. */
export function closeMenusOnOutsideClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  document
    .querySelectorAll<HTMLDetailsElement>(MENU_DETAILS_SELECTOR)
    .forEach((details) => {
      if (!details.contains(target)) details.open = false;
    });
}