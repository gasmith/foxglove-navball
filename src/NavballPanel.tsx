import {
  Immutable,
  MessageEvent,
  PanelExtensionContext,
  Topic,
  SettingsTree,
  SettingsTreeAction,
} from "@foxglove/extension";
import { produce } from "immer";
import { set } from "lodash";
import {
  ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";

import NavballTexture from "./NavballTexture";

type PanelState = {
  topic?: string;
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

  // Restore state from the layout.
  const [state, setState] = useState<PanelState>(() => {
    return context.initialState as PanelState;
  });

  // Filter topics for quaternions.
  const quatTopics = useMemo(
    () => (topics ?? []).filter((topic) => topic.schemaName === "foxglove.Quaternion"),
    [topics],
  );

  // Save settings when they change
  useEffect(() => {
    context.saveState({ topic: state.topic });
    if (state.topic) {
      context.subscribe([{ topic: state.topic }]);
    }
  }, [context, state.topic]);

  // Use the first available quaternion topic as a default, once we have a list
  // of topics available.
  useEffect(() => {
    if (state.topic == undefined) {
      setState({ topic: quatTopics[0]?.name });
    }
  }, [state.topic, quatTopics]);

  // Respond to actions from the settings editor.
  const actionHandler = useCallback(
    (action: SettingsTreeAction) => {
      if (action.action === "update") {
        const { path, value } = action.payload;
        setState(produce((draft) => set(draft, path, value)));
        if (path[1] === "topic") {
          context.subscribe([{ topic: value as string }]);
        }
      }
    },
    [context],
  );

  // Define settings tree
  useEffect(() => {
    const settingsTree: SettingsTree = {
      actionHandler,
      nodes: {
        fields: {
          label: "General",
          fields: {
            topic: {
              label: "Topic",
              input: "select",
              options: quatTopics.map((topic) => ({ value: topic.name, label: topic.name })),
              value: state.topic,
            },
          },
        },
      },
    };
    context.updatePanelSettingsEditor(settingsTree);
  }, [context, state.topic, quatTopics]);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

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

    // Create sphere with texture
    const geometry = new THREE.SphereGeometry(1.5, 64, 64);
    const material = new THREE.MeshPhongMaterial({
      map: NavballTexture,
      shininess: 30,
      specular: 0x444444,
      transparent: true,
      opacity: 1,
    });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);
    sphereRef.current = sphere;

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
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) {
        return;
      }

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      return;
    };
  }, []);

  // Subscribe to quaternion topic
  useLayoutEffect(() => {
    context.onRender = (renderState, done) => {
      setRenderDone(() => done);
      setTopics(renderState.topics);
      if (renderState.currentFrame) {
        setMessages(renderState.currentFrame);
      }
    };

    context.watch("topics");
    context.watch("currentFrame");

    // Subscribe to the selected topic
    if (state.topic) {
      context.subscribe([{ topic: state.topic }]);
    }
  }, [context, state.topic]);

  // Update sphere and marker rotation based on quaternion messages
  useEffect(() => {
    if (!messages || !sphereRef.current) {
      return;
    }

    const msg = messages.find((m: MessageEvent) => m.topic === state.topic);

    if (msg?.message != null) {
      const quaternion = msg.message as {
        x: number;
        y: number;
        z: number;
        w: number;
      };
      // flip z and y
      sphereRef.current.quaternion.set(quaternion.x, quaternion.z, quaternion.y, quaternion.w);
    }
  }, [messages, state.topic]);

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
