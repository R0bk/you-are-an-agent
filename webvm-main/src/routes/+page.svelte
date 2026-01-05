<script>
import WebVM from '$lib/WebVM.svelte';
import * as configObj from '/config_terminal';
import { tryPlausible } from '$lib/plausible.js';
function handleProcessCreated(processCount)
{
	// Log the first 5 processes, to get an idea of the level of interaction from the public
	if(processCount <= 5)
	{
		tryPlausible(`Process started: ${processCount}`);
	}
}
</script>

<WebVM configObj={configObj} processCallback={handleProcessCreated} cacheId="blocks_terminal">
</WebVM>
