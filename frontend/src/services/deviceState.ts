import type { DeviceTelemetry, GatewayDevice } from './deviceApi';

export function canTakeoff(device: GatewayDevice | undefined, preflight: boolean, confirmation: string, busy: boolean): boolean {
  return !!device?.connected && device.hardwareVerified && !!device.status?.physical_enable &&
    !!device.status.armed && !device.status.takeoff_output_active && !device.status.landing_output_active &&
    preflight && confirmation === `TAKEOFF ${device.id}` && !busy;
}
export function canLand(device: GatewayDevice | undefined, busy: boolean): boolean {
  return !!device?.connected && device.hardwareVerified && !!device.status?.physical_enable && !busy;
}
export function hasFreshDronePosition(telemetry: DeviceTelemetry | undefined, now: number): boolean {
  if (!telemetry || !telemetry.gps_fix || telemetry.source === 'unavailable' || !telemetry.timestamp) return false;
  const age = now - Date.parse(telemetry.timestamp);
  return Number.isFinite(age) && age >= 0 && age < 10000 &&
    telemetry.latitude !== null && Number.isFinite(telemetry.latitude) && Math.abs(telemetry.latitude) <= 90 &&
    telemetry.longitude !== null && Number.isFinite(telemetry.longitude) && Math.abs(telemetry.longitude) <= 180;
}
