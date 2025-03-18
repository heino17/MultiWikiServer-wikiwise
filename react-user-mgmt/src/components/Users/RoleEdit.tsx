import { PropsWithChildren, useCallback } from 'react';
import * as forms from "@angular/forms";
import {
  EventEmitter, FormDialog, FormDialogEvents, useFormDialogForm,
  IndexJson, useIndexJson,
  FormDialogSubmitButton,
  serverRequest,
  ok
} from '../../helpers';
import { DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import { onChange } from './shared';


export const RoleForm = (value: IndexJson["roleList"][number] | null) => {
  const form = new forms.FormGroup({
    role_name: new forms.FormControl(value?.role_name ?? "", {
      nonNullable: true, validators: [forms.Validators.required]
    }),
    description: new forms.FormControl(value?.description ?? "", {
      nonNullable: true, validators: [forms.Validators.required]
    }),
  });
  return form;
}

function useRoleEditContext() {
  return useFormDialogForm<IndexJson["roleList"][number], ReturnType<typeof RoleForm>>();
}

export type RoleEditEvents = FormDialogEvents<IndexJson["roleList"][number]>;

export function RoleEdit({ events }: PropsWithChildren<{
  events: EventEmitter<RoleEditEvents>
}>) {
  const [indexJson] = useIndexJson();
  const { isAdmin = false } = indexJson;

  const createForm = useCallback((value: IndexJson["roleList"][number] | null) => RoleForm(value), [isAdmin]);

  return <FormDialog events={events} createForm={createForm}><RoleEditInner /></FormDialog>;
}

export function RoleEditInner() {
  const [indexJson, globalRefresh] = useIndexJson();
  const { isAdmin = false } = indexJson;
  const { value, form: form, onRefresh } = useRoleEditContext();
  const isCreate = value === null;

  return <>
    <DialogTitle>
      {isCreate ? "Create new role" : "Update role"}
    </DialogTitle>
    <DialogContent>
      <Stack direction="column" spacing={2} paddingBlock={2}>
        <TextField
          label="Role Name"
          value={form.controls.role_name.value}
          onChange={onChange(form.controls.role_name)}
        />
        <TextField
          label="Description"
          value={form.controls.description.value}
          onChange={onChange(form.controls.description)}
        />
        <FormDialogSubmitButton
          onSubmit={async () => {
            const formData = form.value;
            console.log(formData, isCreate);

            if (form.invalid) { console.log(form.errors); throw form.errors; }

            const role_name = isCreate ? formData.role_name : value.role_name;
            const { description } = formData;

            ok(role_name);
            ok(description);

            const { role_id } = isCreate
              ? await serverRequest.role_create({
                role_name,
                description,
              })
              : await serverRequest.role_update({
                role_id: value.role_id,
                role_name,
                description,
              });

            const newJson = await globalRefresh();
            const newRole = newJson.roleList.find(e => e.role_id === role_id);
            if (newRole) onRefresh(newRole);

            return `Role ${isCreate ? "created" : "updated"} successfully. `
              + `${newRole ? "Refreshed." : "Refresh to see changes."}`;

          }}
        />
      </Stack>
    </DialogContent>
  </>;
}