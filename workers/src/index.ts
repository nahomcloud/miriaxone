import { Container, getContainer, switchPort } from '@cloudflare/containers';
import { containerEnvironment, handleRequest, resolveBackendSettings } from './routing';

export class MiriaxBackend extends Container<Env> {
  defaultPort = 7576;
  sleepAfter = '10m';
  enableInternet = true;

  override async fetch(request: Request): Promise<Response> {
    this.envVars = containerEnvironment(await resolveBackendSettings(this.env));
    await this.startAndWaitForPorts({
      ports: this.defaultPort,
      cancellationOptions: {
        instanceGetTimeoutMS: 90000,
        portReadyTimeoutMS: 90000,
        waitInterval: 1000,
      },
    });
    return this.containerFetch(request);
  }

  override onError(error: unknown): void {
    console.error(JSON.stringify({ event: 'backend_container_error', message: error instanceof Error ? error.message : String(error) }));
    throw error;
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const settings = await resolveBackendSettings(env);
    return handleRequest(request, { ...settings, ASSETS: env.ASSETS }, async (upstream) => {
      const container = getContainer(env.BACKEND, 'backend-v2');
      return container.fetch(switchPort(upstream, 7576));
    });
  },
} satisfies ExportedHandler<Env>;


