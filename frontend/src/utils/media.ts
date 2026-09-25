export async function getCameraStream(cameraId: string, minWidth: number, minHeight: number) {
    const constraints: MediaStreamConstraints = {
        'audio': { 'echoCancellation': true },
        'video': {
            'deviceId': cameraId,
            'width': { 'min': minWidth },
            'height': { 'min': minHeight }
        }
    }

    return await navigator.mediaDevices.getUserMedia(constraints);
}

export async function getMedia() {
    const permissionStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true },
        video: true
    })

    permissionStream.getTracks().forEach((track) => track.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();

    const cameras = devices.filter((d) => d.kind === 'videoinput');
    const microphones = devices.filter((d) => d.kind === "audioinput");

    return { cameras, microphones }
}