const isImageType = (type) => typeof type === 'string' && type.startsWith('image/');

export const getClipboardImageFile = (clipboardData) => {
  const imageItem = Array.from(clipboardData?.items || [])
    .find((item) => item?.kind === 'file' && isImageType(item.type));
  const itemFile = imageItem?.getAsFile?.();
  if (itemFile) return itemFile;
  return Array.from(clipboardData?.files || []).find((file) => isImageType(file?.type)) || null;
};
