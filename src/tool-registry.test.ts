import { tools } from './index.js'
import { registeredTools } from './tool-registry.js'

describe('tool registry', () => {
    it('exports exactly the tools the server registers through `tools`', () => {
        expect(
            Object.values(tools)
                .map((tool) => tool.name)
                .sort(),
        ).toEqual(registeredTools.map((tool) => tool.name).sort())
    })
})
