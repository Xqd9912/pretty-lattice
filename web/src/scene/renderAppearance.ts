export const PREVIEW_AMBIENT_LIGHT_INTENSITY = 0.68;
export const PREVIEW_HEADLIGHT_INTENSITY = 1.78;

export function lambertLegendSwatchBackground(color: string): string {
  return `linear-gradient(135deg, rgba(255, 255, 255, 0.38) 0 14%, rgba(255, 255, 255, 0) 42%), ${color}`;
}
