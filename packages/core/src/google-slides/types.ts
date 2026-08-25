export type GoogleAuthState = {
  accessToken: string;
  expiresAt: number;
};

export type GoogleSlidesSyncMeta = {
  presentationId: string;
  presentationUrl: string;
  title: string;
  modifiedTime: string;
  slideId?: string;
  lastSyncAt: string;
  lastDirection: 'export' | 'import' | 'sync';
};

export type DomExportElement = {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'text' | 'image' | 'shape';
  text?: string;
  imageUrl?: string;
  backgroundColor?: string;
  color?: string;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: string;
};

export type GooglePresentation = {
  presentationId: string;
  title: string;
  slides: GoogleSlidePage[];
  modifiedTime?: string;
};

export type GoogleSlidePage = {
  objectId: string;
  elements: GooglePageElement[];
  speakerNotes?: string;
};

export type GooglePageElement = {
  objectId: string;
  kind: 'text' | 'image' | 'shape';
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  imageUrl?: string;
  backgroundColor?: string;
  color?: string;
  fontSize?: number;
};
