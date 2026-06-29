import type { MaterialPresetLight, MaterialPresetProps } from "../model/materialPresets";
import { CameraHeadlight } from "./CameraHeadlight";

export function MaterialPresetLights({
  lighting,
}: {
  lighting: MaterialPresetLight[];
}) {
  return (
    <>
      {lighting.map((light, index) => (
        <MaterialPresetLightRenderer
          key={`${index}:${light.type}:${JSON.stringify(light.props)}`}
          light={light}
        />
      ))}
    </>
  );
}

function MaterialPresetLightRenderer({
  light,
}: {
  light: MaterialPresetLight;
}) {
  const props = light.props;

  if (light.type === "AmbientLight") {
    return <ambientLight {...resolveLightProps(props)} />;
  }

  if (light.type === "HemisphereLight") {
    const { skyColor = "#ffffff", groundColor = "#ffffff", intensity = 1, ...rest } = props;
    return (
      <hemisphereLight
        args={[
          expectColor(skyColor, `${light.type}.props.skyColor`),
          expectColor(groundColor, `${light.type}.props.groundColor`),
          expectNumber(intensity, `${light.type}.props.intensity`),
        ]}
        {...resolveLightProps(rest)}
      />
    );
  }

  const { color, intensity, offset } = props;
  return (
    <CameraHeadlight
      color={expectOptionalColor(color, `${light.type}.props.color`)}
      intensity={expectOptionalNumber(intensity, `${light.type}.props.intensity`)}
      offset={expectOptionalVectorTuple(offset, `${light.type}.props.offset`)}
    />
  );
}

function resolveLightProps(props: MaterialPresetProps): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).filter(
      ([, value]) => value !== undefined && value !== null,
    ),
  );
}

function expectOptionalColor(data: unknown, path: string): string | number | undefined {
  if (data === undefined || data === null) {
    return undefined;
  }
  return expectColor(data, path);
}

function expectColor(data: unknown, path: string): string | number {
  if (typeof data === "string" || typeof data === "number") {
    return data;
  }

  throw new Error(`${path} must be a color string or number.`);
}

function expectOptionalNumber(data: unknown, path: string): number | undefined {
  if (data === undefined || data === null) {
    return undefined;
  }
  return expectNumber(data, path);
}

function expectNumber(data: unknown, path: string): number {
  if (typeof data === "number" && Number.isFinite(data)) {
    return data;
  }

  throw new Error(`${path} must be a finite number.`);
}

function expectOptionalVectorTuple(
  data: unknown,
  path: string,
): readonly [number, number, number] | undefined {
  if (data === undefined || data === null) {
    return undefined;
  }
  if (
    Array.isArray(data) &&
    data.length === 3 &&
    data.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  ) {
    return [data[0], data[1], data[2]];
  }

  throw new Error(`${path} must be a three-number array.`);
}
