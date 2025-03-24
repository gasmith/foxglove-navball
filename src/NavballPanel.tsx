import { Immutable, MessageEvent, PanelExtensionContext, Topic } from "@foxglove/extension";
import { ReactElement, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";

type NavballSettings = {
  quaternionTopic: string;
};

function NavballPanel({ context }: { context: PanelExtensionContext }): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [topics, setTopics] = useState<undefined | Immutable<Topic[]>>();
  const [messages, setMessages] = useState<undefined | Immutable<MessageEvent[]>>();
  const [renderDone, setRenderDone] = useState<(() => void) | undefined>();
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sphereRef = useRef<THREE.Mesh | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const markerRef = useRef<THREE.Group | null>(null);
  const [settings, setSettings] = useState<NavballSettings>(() => ({
    quaternionTopic: (context.initialState as NavballSettings)?.quaternionTopic ?? "",
  }));

  // Save settings when they change
  useEffect(() => {
    context.saveState(settings);
  }, [context, settings]);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Create scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      60,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000,
    );
    camera.position.z = 3;
    cameraRef.current = camera;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setClearColor(0x000000, 0);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create a canvas to generate the texture
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    canvas.width = 512;
    canvas.height = 512;

    // Draw a basic navball texture
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid lines
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 2;

    // Draw latitude lines
    for (let i = 0; i <= 8; i++) {
      const y = (canvas.height * i) / 8;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw longitude lines
    for (let i = 0; i <= 8; i++) {
      const x = (canvas.width * i) / 8;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Draw cardinal points
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", canvas.width / 2, 40);
    ctx.fillText("S", canvas.width / 2, canvas.height - 40);
    ctx.fillText("E", canvas.width - 40, canvas.height / 2);
    ctx.fillText("W", 40, canvas.height / 2);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    textureRef.current = texture;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.format = THREE.RGBAFormat;

    // Create sphere with texture
    const geometry = new THREE.SphereGeometry(1.5, 64, 64);
    const material = new THREE.MeshPhongMaterial({
      map: texture,
      shininess: 30,
      specular: 0x444444,
      transparent: true,
      opacity: 1,
    });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);
    sphereRef.current = sphere;

    // Create attitude marker
    const markerGroup = new THREE.Group();

    // Create a small red sphere for the marker
    const markerGeometry = new THREE.SphereGeometry(0.05, 16, 16);
    const markerMaterial = new THREE.MeshPhongMaterial({
      color: 0xff0000,
      shininess: 100,
      specular: 0xffffff,
    });
    const markerSphere = new THREE.Mesh(markerGeometry, markerMaterial);
    markerSphere.position.y = 1.6; // Position slightly above the navball
    markerGroup.add(markerSphere);

    // Add a small line pointing down
    const lineGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8);
    const lineMaterial = new THREE.MeshPhongMaterial({
      color: 0xff0000,
      shininess: 100,
      specular: 0xffffff,
    });
    const line = new THREE.Mesh(lineGeometry, lineMaterial);
    line.position.y = 1.55; // Position between the sphere and navball
    line.rotation.x = Math.PI / 2; // Rotate to point downward
    markerGroup.add(line);

    scene.add(markerGroup);
    markerRef.current = markerGroup;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Add a second directional light from the opposite direction for better illumination
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-5, -5, -5);
    scene.add(directionalLight2);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Subscribe to quaternion topic
  useLayoutEffect(() => {
    context.onRender = (renderState, done) => {
      setRenderDone(() => done);
      setTopics(renderState.topics);
      setMessages(renderState.currentFrame);

      // Subscribe to the selected topic
      if (settings.quaternionTopic) {
        context.subscribe([{ topic: settings.quaternionTopic }]);
      }
    };

    context.watch("topics");
    context.watch("currentFrame");
  }, [context, settings.quaternionTopic]);

  // Update sphere and marker rotation based on quaternion messages
  useEffect(() => {
    if (!messages || !sphereRef.current || !markerRef.current) return;

    const quaternionMessage = messages.find(
      (msg: MessageEvent) => msg.topic === settings.quaternionTopic,
    );

    if (quaternionMessage && quaternionMessage.message) {
      const quaternion = quaternionMessage.message as {
        x: number;
        y: number;
        z: number;
        w: number;
      };
      sphereRef.current.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
      // Apply the same rotation to the marker
      markerRef.current.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    }
  }, [messages, settings.quaternionTopic]);

  // invoke the done callback once the render is complete
  useEffect(() => {
    renderDone?.();
  }, [renderDone]);

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "8px", borderBottom: "1px solid #ccc" }}>
        <select
          value={settings.quaternionTopic}
          onChange={(e) => setSettings({ ...settings, quaternionTopic: e.target.value })}
          style={{ width: "100%", padding: "4px" }}
        >
          <option value="">Select a quaternion topic</option>
          {topics?.map((topic) => (
            <option key={topic.name} value={topic.name}>
              {topic.name}
            </option>
          ))}
        </select>
      </div>
      <div style={{ flex: 1 }} ref={containerRef}>
        {/* Three.js canvas will be inserted here */}
      </div>
    </div>
  );
}

export function initNavballPanel(context: PanelExtensionContext): () => void {
  const root = createRoot(context.panelElement);
  root.render(<NavballPanel context={context} />);

  return () => {
    root.unmount();
  };
}
