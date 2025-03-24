import { Immutable, MessageEvent, PanelExtensionContext, Topic, RenderState } from "@foxglove/extension";
import { ReactElement, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";

function NavballPanel({ context }: { context: PanelExtensionContext }): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [topics, setTopics] = useState<undefined | Immutable<Topic[]>>();
  const [messages, setMessages] = useState<undefined | Immutable<MessageEvent[]>>();
  const [renderDone, setRenderDone] = useState<(() => void) | undefined>();
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sphereRef = useRef<THREE.Mesh | null>(null);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Create scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 5;
    cameraRef.current = camera;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create sphere (placeholder for now)
    const geometry = new THREE.SphereGeometry(2, 32, 32);
    const material = new THREE.MeshStandardMaterial({ color: 0x808080 });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);
    sphereRef.current = sphere;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

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

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Subscribe to quaternion topic
  useLayoutEffect(() => {
    context.onRender = (renderState, done) => {
      setRenderDone(() => done);
      setTopics(renderState.topics);
      setMessages(renderState.currentFrame);

      // Find the topic with foxglove.Quaternion schema
      if (renderState.topics) {
        const quaternionTopic = renderState.topics.find(
          (topic: Topic) => topic.schemaName === "foxglove.Quaternion"
        );

        if (quaternionTopic) {
          context.subscribe([{ topic: quaternionTopic.name }]);
        }
      }
    };

    context.watch("topics");
    context.watch("currentFrame");
  }, [context]);

  // Update sphere rotation based on quaternion messages
  useEffect(() => {
    if (!messages || !sphereRef.current) return;

    const quaternionMessage = messages.find(
      (msg: MessageEvent) => {
        const topic = msg.topic as unknown as Topic;
        return topic && topic.schemaName === "foxglove.Quaternion";
      }
    );

    if (quaternionMessage && quaternionMessage.message) {
      const quaternion = quaternionMessage.message as { x: number; y: number; z: number; w: number };
      sphereRef.current.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    }
  }, [messages]);

  // invoke the done callback once the render is complete
  useEffect(() => {
    renderDone?.();
  }, [renderDone]);

  return (
    <div style={{ width: "100%", height: "100%" }} ref={containerRef}>
      {/* Three.js canvas will be inserted here */}
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
