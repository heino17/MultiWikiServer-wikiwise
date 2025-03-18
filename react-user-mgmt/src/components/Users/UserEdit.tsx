import { PropsWithChildren, useCallback } from 'react';
import * as forms from "@angular/forms";
import {
  EventEmitter, FormDialog, FormDialogEvents, useFormDialogForm,
  IndexJson, useIndexJson,
  FormDialogSubmitButton,
  serverRequest,
  ok,
  SelectField,
  useObservable
} from '../../helpers';
import { DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import { onChange } from './shared';


const UserForm = (value: User | null) => {
  const form = new forms.FormGroup({
    username: new forms.FormControl(value?.username ?? "", {
      nonNullable: true, validators: [forms.Validators.required]
    }),
    email: new forms.FormControl(value?.email ?? "", {
      nonNullable: true, validators: [forms.Validators.required]
    }),
    roles: new forms.FormControl(value?.roles.map(e => e.role_id) ?? [], {
      nonNullable: true, validators: [forms.Validators.required]
    }),
  });
  return form;
}

type User = (IndexJson["userList"] & {})[number];

function useUserEditContext() {
  return useFormDialogForm<User, ReturnType<typeof UserForm>>();
}

export type UserEditEvents = FormDialogEvents<User>;

export function UserEdit({ events }: PropsWithChildren<{
  events: EventEmitter<UserEditEvents>
}>) {
  const [indexJson] = useIndexJson();
  const { isAdmin = false } = indexJson;

  const createForm = useCallback((value: User | null) => UserForm(value), [isAdmin]);

  return <FormDialog events={events} createForm={createForm}><UserEditInner /></FormDialog>;
}

export function UserEditInner() {
  const [indexJson, globalRefresh] = useIndexJson();
  const { isAdmin = false } = indexJson;
  const { value, form: form, onRefresh } = useUserEditContext();
  const isCreate = value === null;
  useObservable(form.events);

  return <>
    <DialogTitle>
      {isCreate ? "Create new role" : "Update role"}
    </DialogTitle>
    <DialogContent>
      <Stack direction="column" spacing={2} paddingBlock={2}>
        <TextField
          label="User Name"
          value={form.controls.username.value}
          onChange={onChange(form.controls.username)}
        />
        <TextField
          label="Email"
          value={form.controls.email.value}
          onChange={onChange(form.controls.email)}
        />
        <SelectField
          title="Roles"
          multiple
          control={form.controls.roles}
          options={indexJson.roleList.map(e => ({ value: e.role_id, label: e.role_name }))}
        />
        <FormDialogSubmitButton
          onSubmit={async () => {
            const formData = form.value;
            console.log(formData, isCreate);
            return "Not implemented yet.";
          }}
        />
      </Stack>
    </DialogContent>
  </>;
}