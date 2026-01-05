<script>
	import { cpuActivity, diskActivity } from './activities.js';
</script>

<div class="fixed top-2 right-2 flex gap-2 z-50">
	<!-- CPU Indicator -->
	<div class="flex items-center gap-1 text-xs text-gray-400">
		<div
			class="w-2 h-2 rounded-full transition-all duration-150"
			class:bg-green-500={$cpuActivity}
			class:bg-gray-700={!$cpuActivity}
			style="box-shadow: {$cpuActivity ? '0 0 8px rgba(34, 197, 94, 0.8)' : 'none'};"
		></div>
		<span class="font-mono">CPU</span>
	</div>

	<!-- Disk Indicator -->
	<div class="flex items-center gap-1 text-xs text-gray-400">
		<div
			class="w-2 h-2 rounded-full transition-all duration-150"
			class:bg-blue-500={$diskActivity}
			class:bg-gray-700={!$diskActivity}
			style="box-shadow: {$diskActivity ? '0 0 8px rgba(59, 130, 246, 0.8)' : 'none'};"
		></div>
		<span class="font-mono">DISK</span>
	</div>
</div>
