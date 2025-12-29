import { Langfuse } from 'langfuse';

let langfuseClient: Langfuse | null = null;

export function getLangfuseClient(): Langfuse | null {
  if (langfuseClient) {
    return langfuseClient;
  }

  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const host = process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com';

  if (!secretKey || !publicKey) {
    console.warn('Langfuse keys not configured, tracking disabled');
    return null;
  }

  try {
    langfuseClient = new Langfuse({
      secretKey,
      publicKey,
      baseUrl: host,
    });
    return langfuseClient;
  } catch (error) {
    console.error('Failed to initialize Langfuse:', error);
    return null;
  }
}

export function createTrace(
  name: string,
  userId?: string,
  metadata?: Record<string, unknown>
) {
  const client = getLangfuseClient();
  if (!client) return null;

  try {
    const trace = client.trace({
      name,
      userId,
      metadata,
    });

    // Return a wrapper that safely handles trace methods
    return {
      ...trace,
      span: (options: any) => {
        if (trace && typeof trace.span === 'function') {
          return trace.span(options);
        }
        return null;
      },
      generation: (options: any) => {
        if (trace && typeof trace.generation === 'function') {
          return trace.generation(options);
        }
        return null;
      },
      end: (output?: Record<string, unknown>) => {
        if (trace && typeof trace.update === 'function') {
          trace.update({ output });
        }
      },
      update: (data: Record<string, unknown>) => {
        if (trace && typeof trace.update === 'function') {
          trace.update(data);
        }
      },
    };
  } catch (error) {
    console.error('Langfuse trace creation error:', error);
    return null;
  }
}

export function createSpan(
  trace: any,
  name: string,
  metadata?: Record<string, unknown>
) {
  if (!trace) return null;

  try {
    // Use the span method from the trace wrapper
    const span = trace.span ? trace.span({
      name,
      metadata,
    }) : null;

    if (!span) return null;

    return {
      ...span,
      end: (output?: Record<string, unknown>) => {
        if (span && typeof span.update === 'function') {
          span.update({ output });
        }
      },
      update: (data: Record<string, unknown>) => {
        if (span && typeof span.update === 'function') {
          span.update(data);
        }
      },
    };
  } catch (error) {
    console.error('Langfuse span creation error:', error);
    return null;
  }
}

export function createGeneration(
  trace: any,
  name: string,
  metadata?: Record<string, unknown>
) {
  if (!trace) return null;

  try {
    // Use the generation method from the trace wrapper
    const generation = trace.generation ? trace.generation({
      name,
      metadata,
    }) : null;

    if (!generation) return null;

    return {
      ...generation,
      end: (output?: Record<string, unknown>) => {
        if (generation && typeof generation.update === 'function') {
          generation.update({ output });
        }
      },
      update: (data: Record<string, unknown>) => {
        if (generation && typeof generation.update === 'function') {
          generation.update(data);
        }
      },
    };
  } catch (error) {
    console.error('Langfuse generation creation error:', error);
    return null;
  }
}

