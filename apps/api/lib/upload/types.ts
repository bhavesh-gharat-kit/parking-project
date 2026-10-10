export type UploadableFile = {
  buffer: Buffer;
  mimetype: string;
};

export type UploadResult = {
  url: string;
  filename: string;
  size: number;
  mimetype: string;
};
