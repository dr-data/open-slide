import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../app/lib/sdk';

/** Google Slides widescreen page size in points (10in × 5.625in). */
export const GOOGLE_PAGE_WIDTH_PT = 720;
export const GOOGLE_PAGE_HEIGHT_PT = 405;

export const OS_TO_GOOGLE_X = GOOGLE_PAGE_WIDTH_PT / CANVAS_WIDTH;
export const OS_TO_GOOGLE_Y = GOOGLE_PAGE_HEIGHT_PT / CANVAS_HEIGHT;

export const GOOGLE_TO_OS_X = CANVAS_WIDTH / GOOGLE_PAGE_WIDTH_PT;
export const GOOGLE_TO_OS_Y = CANVAS_HEIGHT / GOOGLE_PAGE_HEIGHT_PT;

export const GOOGLE_SLIDES_SCOPE = 'https://www.googleapis.com/auth/presentations';
export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const GOOGLE_API_BASE = 'https://slides.googleapis.com/v1';
export const GOOGLE_DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
