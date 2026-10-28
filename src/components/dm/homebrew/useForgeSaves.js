import { useEffect, useRef } from 'react'
import { listenForSaves, newHandoffKey, openInChain } from '../../../lib/forgeHandoff'
import { applyForgeSave } from '../../../lib/forgeClassRows'

// The class editors' side of the chain builder tab (lib/forgeHandoff.js):
// a save there fills in the row it was opened for, and `create` is
// RepeatableRows' onCreate - a placeholder row, and the chain builder opens
// in a new tab for it. label: the class's name, for the chain tab.
export function useForgeSaves(form, setForm, label) {
  const formRef = useRef(form)
  formRef.current = form
  const labelRef = useRef(label)
  labelRef.current = label

  useEffect(
    () =>
      listenForSaves(({ key, draftId, spec }) => {
        const next = applyForgeSave(formRef.current, key, { draftId, spec })
        if (!next) return null
        formRef.current = next
        setForm(next)
        return labelRef.current || 'the class'
      }),
    [setForm]
  )

  function create(add) {
    const key = newHandoffKey()
    add({ forge_key: key })
    openInChain({ key, start: { name: '', description: '', label: labelRef.current } })
  }

  return create
}
