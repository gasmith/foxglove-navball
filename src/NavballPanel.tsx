import {
  Immutable,
  MessageEvent,
  PanelExtensionContext,
  Topic,
  SettingsTree,
  SettingsTreeAction,
} from "@foxglove/extension";
import { ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";

import NavballTexture from "./NavballTexture";

type PanelState = {
  topic?: string;
  course_topic?: string;
};

// Define type for overlay group with course line
type OverlayGroup = THREE.Group & {
  courseLine?: THREE.Line;
};

// Define type for sphere with course line
type SphereWithCourseLine = THREE.Mesh & {
  courseLine?: THREE.Line;
};

function NavballPanel({ context }: { context: PanelExtensionContext }): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [topics, setTopics] = useState<undefined | Immutable<Topic[]>>();
  const [messages, setMessages] = useState<undefined | Immutable<MessageEvent[]>>();
  const [renderDone, setRenderDone] = useState<(() => void) | undefined>();
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sphereRef = useRef<SphereWithCourseLine | null>(null);
  const overlayGroupRef = useRef<OverlayGroup | null>(null);

  // Restore state from the layout.
  const [state, setState] = useState<PanelState>(() => {
    return context.initialState as PanelState;
  });

  // Filter topics for quaternions.
  const quatTopics = useMemo(
    () => (topics ?? []).filter((topic) => topic.schemaName === "foxglove.Quaternion"),
    [topics],
  );
  // Filter topics for vectors.
  const vecTopics = useMemo(
    () => (topics ?? []).filter((topic) => topic.schemaName === "foxglove.Vector3"),
    [topics],
  );

  // When settings change, save state.
  useEffect(() => {
    context.saveState(state);
    if (state.topic) {
      context.subscribe([{ topic: state.topic }]);
    }
    if (state.course_topic) {
      context.subscribe([{ topic: state.course_topic }]);
    }
  }, [context, state]);

  // When topics change, subscribe.
  useEffect(() => {
    const subs = [state.topic, state.course_topic]
      .filter((t): t is string => t != undefined)
      .map((t) => ({ topic: t }));
    context.subscribe(subs);
  }, [context, state.topic, state.course_topic]);

  // Use the first available quaternion topic as a default, once we have a list
  // of topics available.
  useEffect(() => {
    if (state.topic == undefined) {
      setState({ topic: quatTopics[0]?.name });
    }
  }, [state.topic, quatTopics]);

  // Respond to actions from the settings editor.
  const actionHandler = useCallback((action: SettingsTreeAction) => {
    if (action.action === "update") {
      const { path, value } = action.payload;
      if (path[1] === "topic") {
        setState((prev) => ({ ...prev, topic: value as string }));
      } else if (path[1] === "course_topic") {
        setState((prev) => ({ ...prev, course_topic: value as string }));
      }
    }
  }, []);

  // Define settings tree
  useEffect(() => {
    const settingsTree: SettingsTree = {
      actionHandler,
      nodes: {
        fields: {
          label: "General",
          fields: {
            topic: {
              label: "Attitude topic",
              input: "select",
              options: quatTopics.map((topic) => ({ value: topic.name, label: topic.name })),
              value: state.topic,
            },
            course_topic: {
              label: "Course topic",
              input: "select",
              options: vecTopics.map((topic) => ({ value: topic.name, label: topic.name })),
              value: state.course_topic,
            },
          },
        },
      },
    };
    context.updatePanelSettingsEditor(settingsTree);
  }, [actionHandler, context, state.topic, state.course_topic, quatTopics, vecTopics]);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const container = containerRef.current;

    // Create scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    camera.position.z = 3;
    cameraRef.current = camera;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
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

    // Create course indicator line
    const courseLineGeometry = new THREE.BufferGeometry();
    const segments = 64;
    const courseLinePoints = [];
    for (let i = 0; i <= segments; i++) {
      const phi = (i / segments) * Math.PI;
      courseLinePoints.push(new THREE.Vector3(0, 1.5 * Math.cos(phi), 1.5 * Math.sin(phi)));
    }
    courseLineGeometry.setFromPoints(courseLinePoints);
    const courseLineMaterial = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.7,
    });
    const courseLine = new THREE.Line(courseLineGeometry, courseLineMaterial);
    courseLine.visible = false; // Initially hidden
    sphere.add(courseLine); // Add to sphere instead of overlay group
    sphereRef.current.courseLine = courseLine;

    // Create overlay group
    const overlayGroup = new THREE.Group();
    overlayGroupRef.current = overlayGroup;
    scene.add(overlayGroup);

    // Create circle
    const circleGeometry = new THREE.RingGeometry(0.03, 0.04, 32);
    const circleMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    const circle = new THREE.Mesh(circleGeometry, circleMaterial);

    // Create horizontal line
    const lineGeometry = new THREE.BufferGeometry();
    const linePoints = [new THREE.Vector3(-0.2, 0, 0), new THREE.Vector3(0.2, 0, 0)];
    lineGeometry.setFromPoints(linePoints);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.7,
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);

    // Add elements to overlay group
    overlayGroup.add(circle);
    overlayGroup.add(line);

    // Position overlay in front of camera
    overlayGroup.position.z = -1.5;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-5, -5, -5);
    scene.add(directionalLight2);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);

      // Keep overlay fixed relative to camera
      if (overlayGroupRef.current && cameraRef.current) {
        overlayGroupRef.current.position.copy(cameraRef.current.position);
        overlayGroupRef.current.position.z -= 1.5;
        overlayGroupRef.current.quaternion.copy(cameraRef.current.quaternion);
      }

      renderer.render(scene, camera);
    };
    animate();

    // Window resize handler.
    const resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(container);

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  // Subscribe to quaternion topic
  useEffect(() => {
    context.onRender = (renderState, done) => {
      setRenderDone(() => done);
      setTopics(renderState.topics);
      if (renderState.currentFrame) {
        setMessages(renderState.currentFrame);
      }
    };

    context.watch("topics");
    context.watch("currentFrame");
  }, [context]);

  // Update sphere and marker rotation based on quaternion messages
  useEffect(() => {
    if (!messages || !sphereRef.current) {
      return;
    }

    const quatMsg = messages.find((m: MessageEvent) => m.topic === state.topic);
    const courseMsg = messages.find((m: MessageEvent) => m.topic === state.course_topic);

    if (quatMsg?.message != null) {
      const quaternion = quatMsg.message as {
        x: number;
        y: number;
        z: number;
        w: number;
      };
      // flip z and y
      sphereRef.current.quaternion.set(quaternion.x, quaternion.z, quaternion.y, quaternion.w);
    }

    if (courseMsg?.message != null && sphereRef.current.courseLine) {
      const vector = courseMsg.message as {
        x: number;
        y: number;
        z: number;
      };
      // Normalize x,y components
      const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
      if (length > 0) {
        const normalizedX = vector.x / length;
        const normalizedY = vector.y / length;
        const angle = Math.atan2(normalizedX, normalizedY);
        sphereRef.current.courseLine.rotation.y = angle;
        sphereRef.current.courseLine.visible = true;
      }
    } else if (sphereRef.current.courseLine) {
      sphereRef.current.courseLine.visible = false;
    }
  }, [messages, state.topic, state.course_topic]);

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
