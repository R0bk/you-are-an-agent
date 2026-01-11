import React, { useEffect, useMemo, useRef } from "react";
import { webvmService } from "../services/webvmService";

type WebVMFrameProps = {
    className?: string;
};

/**
 * Embeds the WebVM UI (from `webvm-main`) inside an iframe and wires it to `webvmService`.
 */
export const WebVMFrame: React.FC<WebVMFrameProps> = ({ className }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const src = useMemo(() => webvmService.getEmbedUrl(), []);

    useEffect(() => {
        webvmService.attachIframe(iframeRef.current);
        return () => webvmService.attachIframe(null);
    }, []);

    return (
        <iframe
            ref={iframeRef}
            className={className ?? "w-full h-full"}
            src={src}
            title="WebVM"
            allow="clipboard-read; clipboard-write"
        />
    );
};



