/**
 * API constants shared by frontend services and the backend router.
 * Contract changes must update both sides in the same change.
 */
export const API_VERSION = 'v1' as const
export const API_ROOT = `/api/${API_VERSION}` as const
