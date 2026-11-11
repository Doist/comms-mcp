import { describeOutputSchemaNullability } from '@todoist/mcp-core/testing'
import { registeredTools } from '../tool-registry.js'

/**
 * Structured content is sanitised with `removeNullFields` on its way out, so no
 * null ever reaches a client. A tool that declares an output field as nullable
 * therefore promises a value it can never send. The shape that survives
 * sanitisation is `.optional()` with the key left out when there is nothing to
 * report.
 */
describeOutputSchemaNullability(registeredTools)
