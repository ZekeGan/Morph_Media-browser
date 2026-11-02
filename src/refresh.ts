import { createContext, useContext } from 'react'

// Bumped by the top-bar refresh button; panels that load their own content re-fetch when it changes.
export const RefreshContext = createContext(0)
export const useRefreshNonce = () => useContext(RefreshContext)
