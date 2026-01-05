import { writable } from 'svelte/store';
import { browser } from '$app/environment'

let authKey = undefined;
let controlUrl = undefined;
if(browser)
{
	let params = new URLSearchParams("?"+window.location.hash.substr(1));
	authKey = params.get("authKey") || undefined;
	controlUrl = params.get("controlUrl") || undefined;
}
let dashboardUrl = controlUrl ? null : "https://login.tailscale.com/admin/machines";
let connectionState = writable("DISCONNECTED");
let exitNode = writable(false);

function stateUpdateCb(state)
{
	switch(state)
	{
		case 6 /*Running*/:
		{
			connectionState.set("CONNECTED");
			break;
		}
	}
}

function netmapUpdateCb(map)
{
	networkData.currentIp = map.self.addresses[0];
	var exitNodeFound = false;
	for(var i=0; i < map.peers.length;i++)
	{
		if(map.peers[i].exitNode)
		{
			exitNodeFound = true;
			break;
		}
	}
	if(exitNodeFound)
	{
		exitNode.set(true);
	}
}


export const networkInterface = { authKey: authKey, controlUrl: controlUrl, stateUpdateCb: stateUpdateCb, netmapUpdateCb: netmapUpdateCb };

export const networkData = { currentIp: null, connectionState: connectionState, exitNode: exitNode, dashboardUrl: dashboardUrl }
