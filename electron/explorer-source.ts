import { sourceFamily, sourceForUrl, type MetadataSourceId } from '../shared/sources'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { safePath, saveFolder } from './files'
import { DATA_DIR, validateDetails, type Attribute } from '../shared/model'
import { newDetails, type ExplorerRequest, type MetadataPreview } from '../shared/explorer'
import { metadata } from './metadata'
import { fetchImageUrl } from './image-url'
import { key } from './media-files'
import type { Explorer } from './explorer'

export async function metadataPreview(
  ex: Explorer,
  source: string,
  provider?: MetadataSourceId
): Promise<MetadataPreview> {
  const item = await metadata(source, fetch, provider),
    preview: MetadataPreview = { ...item.preview, token: randomUUID() }
  for (const [id, p] of ex.previews) if (p.expires < Date.now()) ex.previews.delete(id)
  if (ex.previews.size >= 10) ex.previews.delete(ex.previews.keys().next().value!)
  ex.previews.set(preview.token, {
    preview,
    cover: item.cover,
    expires: Date.now() + 15 * 60 * 1000,
  })
  return preview
}

export async function imageUrlPreview(ex: Explorer, url: string) {
  const item = await fetchImageUrl(url, ex.imageUrlOptions),
    token = randomUUID()
  for (const [id, p] of ex.imagePreviews) if (p.expires < Date.now()) ex.imagePreviews.delete(id)
  while (ex.imagePreviews.size >= 5) ex.imagePreviews.delete(ex.imagePreviews.keys().next().value!)
  ex.imagePreviews.set(token, { ...item, expires: Date.now() + 15 * 60 * 1000 })
  return {
    token,
    image: 'data:' + item.mime + ';base64,' + item.bytes.toString('base64'),
    name: item.name,
    size: item.bytes.length,
  }
}

export async function applyImageUrl(
  ex: Explorer,
  req: Extract<ExplorerRequest, { action: 'imageUrlApply' }>
) {
  const item = ex.imagePreviews.get(req.token)
  if (!item || item.expires < Date.now()) throw new Error('圖片預覽已過期，請重新取得')
  const { row, record } = await ex.record(req.rowId, req.revision),
    assetId = randomUUID(),
    relativePath = `assets/${assetId}.${item.ext}`,
    target = path.join(row.path, DATA_DIR, relativePath)
  await safePath(row.path, target)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, item.bytes, { flag: 'wx' })
  record.assets.push({ assetId, relativePath, originalName: item.name, mediaType: item.mime })
  if (req.cover) {
    record.details ??= newDetails()
    record.details.bannerAssetId = assetId
    validateDetails(record.details)
  }
  try {
    await saveFolder(row.path, record, req.revision)
  } catch (e) {
    await fs.unlink(target).catch(() => {})
    throw e
  }
  ex.imagePreviews.delete(req.token)
}

export async function applyMetadata(
  ex: Explorer,
  req: Extract<ExplorerRequest, { action: 'metadataApply' }>
) {
  const item = ex.previews.get(req.token)
  if (!item || item.expires < Date.now()) throw new Error('候選已過期，請重新取得')
  if (
    !Array.isArray(req.keys) ||
    !req.keys.every((k) => item.preview.values.some((v) => v.key === k))
  )
    throw new Error('匯入欄位不合法')
  const { row, record } = await ex.record(req.rowId, req.revision)
  if (req.mode !== undefined && !['fill', 'replace'].includes(req.mode))
    throw new Error('來源匯入模式不合法')
  for (const v of item.preview.values.filter((v) => req.keys.includes(v.key))) {
    const provider = item.preview.provider ?? 'eh',
      attributeId = provider + '-' + v.key.toLowerCase(),
      // ExHentai data saved before the two sites shared fields lives under exh-…; it is taken over by eh-….
      legacyId = provider === 'eh' ? 'exh-' + v.key.toLowerCase() : undefined,
      old =
        record.attributes.find((attribute) => attribute.attributeId === attributeId) ??
        record.attributes.find((attribute) => attribute.attributeId === legacyId)
    if (old && sourceFamily(sourceForUrl(old.source)) !== sourceFamily(provider))
      throw new Error('既有欄位來源衝突')
    const filled =
      old &&
      old.value !== null &&
      old.value !== undefined &&
      old.value !== '' &&
      (!Array.isArray(old.value) || old.value.length > 0)
    if (req.mode !== 'replace' && filled) continue
    const attribute: Attribute = {
      ...v,
      attributeId,
      source: item.preview.source,
      sourceRecord: { provider, url: item.preview.source, fetchedAt: new Date().toISOString() },
    }
    ex.checkValue(attribute, record)
    record.attributes = record.attributes.filter(
      (attribute) => attribute.attributeId !== attributeId && attribute.attributeId !== legacyId
    )
    record.attributes.push(attribute)
  }
  let added: string | undefined
  if (
    req.image &&
    item.cover &&
    (req.mode === 'replace' ||
      !record.assets.some((asset) =>
        asset.originalName.startsWith((item.preview.provider ?? 'eh') + '-cover.')
      ))
  ) {
    const { bytes, ext, mime } = item.cover,
      assetId = randomUUID(),
      relativePath = `assets/${assetId}.${ext}`
    added = path.join(row.path, DATA_DIR, relativePath)
    await safePath(row.path, added)
    await fs.mkdir(path.dirname(added), { recursive: true })
    await fs.writeFile(added, bytes, { flag: 'wx' })
    record.assets.push({
      assetId,
      relativePath,
      originalName: (item.preview.provider ?? 'eh') + '-cover.' + ext,
      mediaType: mime,
    })
  }
  try {
    await saveFolder(row.path, record, req.revision)
  } catch (e) {
    if (added) await fs.unlink(added)
    throw e
  }
}
