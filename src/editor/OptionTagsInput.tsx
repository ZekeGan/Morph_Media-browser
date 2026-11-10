import { useState } from 'react'
import { TagsInput, type TagsInputProps } from '@mantine/core'

const separators = /[,，]/

// Options typed as tags. Mantine splits only on a comma key press; a full-width comma typed through an input method
// (or pasted with other text) arrives as text, so the typed text is split here too (R-229). Enter also adds a tag.
export function OptionTagsInput(props: TagsInputProps) {
  const [search, setSearch] = useState('')
  const value = props.value ?? []
  return (
    <TagsInput
      splitChars={[',', '，']}
      {...props}
      searchValue={search}
      onSearchChange={(text) => {
        if (!separators.test(text)) {
          setSearch(text)
          return
        }
        const parts = text.split(separators),
          rest = parts.pop() ?? '',
          added = parts.map((part) => part.trim()).filter((part) => part && !value.includes(part))
        if (added.length) props.onChange?.([...value, ...new Set(added)])
        setSearch(rest)
      }}
    />
  )
}
