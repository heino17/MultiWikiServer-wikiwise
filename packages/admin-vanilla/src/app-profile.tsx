import { addstyles, customElement, JSXElement, state } from "@tiddlywiki/jsx-lit";
import accountCircleIcon from "@material-symbols/svg-400/outlined/account_circle.svg";
import {
  AdminRecord,
} from "./app";
import { FieldDefinition, IdString, FieldZodType, FieldType, Drafter } from "./definition/tabs";
import css from "./app.inline.css";
import { t } from "./i18n";
import { MaterialSymbol } from "./material-symbol";
import { changeExistingPasswordWithCode, changeExistingPasswordWithPassword, loginWithOpaque, serverAcceptResetCode } from "./passwords";
import { FomController } from "./FomController";

const profileFields = [
  {
    key: "username",
    label: t("Username"),
    type: "string",
    mode: "server",
  },
  {
    key: "email",
    label: t("Email"),
    type: "string",
    mode: "server",
  },
  {
    key: "roles",
    label: t("Roles"),
    type: "search-multiselect",
    mode: "server"
  }
] as const satisfies FieldDefinition[];

const updatePasswordFields = [

  {
    key: "password",
    label: t("Current password"),
    type: "enter-password",
    mode: "create",
  },
  {
    key: "newPassword",
    label: t("New password"),
    passwordGenerator: "confirmNewPassword",
    type: "enter-password",
    mode: "create",
  },
  {
    key: "confirmNewPassword",
    label: t("Confirm new password"),
    type: "enter-password",
    mode: "create",
  },
] as const satisfies FieldDefinition[];


type ProfileDraft = Drafter<typeof profileFields> & Drafter<typeof updatePasswordFields>;

type LoginServerState = {
  csrfToken: string;
  emailEnabled: boolean;
};

const renderCallout = (content: JSX.Node) => <div class="field-callout"><p>{content}</p></div>;

/** Success messages after a reload from an upload/remove/password change.
 *  Reloading keeps the header, the menu and this form in sync with the server. */
function profileStateMessage(): string {
  switch (new URLSearchParams(globalThis.location?.search ?? "").get("state")) {
    case "password-changed": return t("Password updated. You can now log in.");
    case "avatar-changed": return t("Profile picture updated.");
    case "avatar-removed": return t("Profile picture removed.");
    default: return "";
  }
}

@addstyles(css)
@customElement("mws-profile-form")
export class ProfileForm extends JSXElement {
  // AGENTS: When the user edits this class directly, treat those changes as intentional and
  // important signals about desired behavior unless they explicitly ask to remove them.
  useLightDOM: boolean = true;
  constructor() { super(); }

  control: FomController<ProfileDraft> = new FomController<ProfileDraft>(this);

  handleAnySubmit: FomController<ProfileDraft>["handleAnySubmit"] = (...args) => this.control.handleAnySubmit(...args)

  onCancel = async () => {
    location.pathname = pathPrefix + "/";
  }

  @state() accessor props!: {}

  // #region state
  @state() accessor draft: ProfileDraft = this.createDraft();

  @state() private accessor mode: "profile" | "updatePassword" = "profile";
  @state() private accessor isSubmitting: boolean = false;
  @state() private accessor avatarBusy: boolean = false;
  @state() private accessor avatarMessage: string = "";
  @state() private accessor submitMessage: string = profileStateMessage();


  private createDraft(): ProfileDraft {
    const userState = embeddedServerResponse.userState;
    return {
      id: new IdString(userState.user_id),
      email: userState.email ?? "",
      username: userState.username,
      roles: userState.roles.map((role) => role.role_name),
      password: "",
      newPassword: "",
      confirmNewPassword: "",
    };
  }

  protected render() {
    switch (this.mode) {
      case "profile": {

        return this.control.renderCommon({
          title: t("User Profile"),
          copy: t("View your profile."),
          submitAction: this.handleProfileSubmit,
          submitDisabled: false,
          submitLabel: t("Update password"),
          backAction: this.onCancel,
          backLabel: t("Close"),
        }, <>
          <div class="login-fields">
            {profileFields.map((field) => this.control.renderField(field))}
          </div>
          <div class="field-callout profile-avatar-block">
            <p>{t("Own profile picture")}</p>
            <div class="profile-avatar-row">
              <span class="profile-avatar-preview" aria-hidden="true">
                {embeddedServerResponse.userState.avatarUrl
                  ? <img src={embeddedServerResponse.userState.avatarUrl} alt="" />
                  : <MaterialSymbol icon={accountCircleIcon} />}
              </span>
              <div class="profile-avatar-actions">
                <label class="ghost-button profile-avatar-file">
                  {t("Choose picture")}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    disabled={this.avatarBusy}
                    onchange={this.handleAvatarPick}
                  />
                </label>
                {embeddedServerResponse.userState.avatarUrl
                  ? <button class="ghost-button" type="button" disabled={this.avatarBusy} onclick={this.handleAvatarRemove}>{t("Remove picture")}</button>
                  : null}
              </div>
            </div>
            <p class="profile-avatar-hint">{t("At most 100 KB and 256 × 256 px (JPEG, PNG, GIF, WebP). Larger pictures are scaled down.")}</p>
            {this.avatarMessage ? <p class="profile-avatar-message">{this.avatarMessage}</p> : null}
          </div>
        </>);

      } break;


      case "updatePassword": {

        const updatePasswordActionDisabled = this.isSubmitting
          || !this.draft.newPassword
          || !this.draft.confirmNewPassword
          || this.draft.newPassword !== this.draft.confirmNewPassword;

        return this.control.renderCommon({
          title: t("Update password"),
          copy: t("Choose a new password for your account."),
          submitAction: this.handleUpdatePasswordSubmit,
          submitDisabled: updatePasswordActionDisabled,
          submitLabel: t("Update password"),
          backAction: async () => { this.mode = "profile"; },
        }, <>
          <div class="login-fields">
            {updatePasswordFields.map((field) => this.control.renderField(field))}
          </div>
        </>);
      }

    }

  }

  /** Upload uses the same multipart pattern as "Meine Dateien": the server
   *  streams the file, checks its real type and scales it down. A reload keeps
   *  the header, account menu and this preview in sync. */
  private readonly handleAvatarPick = async (event: Event): Promise<void> => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.avatarBusy = true;
    this.avatarMessage = t("Uploading picture…");
    try {
      const body = new FormData();
      body.append("avatar", file, file.name);
      const response = await fetch(pathPrefix + "/api/users/me/avatar", {
        method: "PUT",
        headers: { "X-Requested-With": "TiddlyWiki" },
        body,
      });
      if (response.status !== 200) {
        const detail = await response.text();
        throw new Error(detail || String(response.status));
      }
      location.search = "?state=avatar-changed";
    } catch (error) {
      this.avatarMessage = `${t("Could not update the profile picture.")} ${error instanceof Error ? error.message : ""}`.trim();
      this.avatarBusy = false;
      input.value = "";
    }
  };

  private readonly handleAvatarRemove = async (): Promise<void> => {
    this.avatarBusy = true;
    this.avatarMessage = t("Removing picture…");
    try {
      const response = await fetch(pathPrefix + "/api/users/me/avatar/remove", {
        method: "PUT",
        headers: { "X-Requested-With": "TiddlyWiki" },
      });
      if (response.status !== 200) throw new Error(String(response.status));
      location.search = "?state=avatar-removed";
    } catch (error) {
      this.avatarMessage = `${t("Could not remove the profile picture.")} ${error instanceof Error ? error.message : ""}`.trim();
      this.avatarBusy = false;
    }
  };

  private readonly handleProfileSubmit = async () => {
    await this.handleAnySubmit(
      t("Update password"),
      "",
      async () => {
        this.mode = "updatePassword";
        return true;
      }
    );
  }

  private readonly handleUpdatePasswordSubmit = async (): Promise<void> => {
    const newPassword = this.draft.newPassword;
    const confirmNewPassword = this.draft.confirmNewPassword;

    if (!newPassword || !confirmNewPassword) {
      this.submitMessage = t("Enter and confirm your new password.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      this.submitMessage = t("Passwords do not match.");
      return;
    }

    await this.handleAnySubmit(
      t("Updating password…"),
      t("Password update failed."),
      () => this.submitUpdatePassword()
    );
  };

  private submitUpdatePassword = async (): Promise<boolean> => {
    const clientState = this.draft;
    await changeExistingPasswordWithPassword({
      username: embeddedServerResponse.userState.username,
      password: clientState.password,
      newPassword: clientState.newPassword,
    });
    location.search = "?state=password-changed";
    return new Promise(() => { });
  }

}



