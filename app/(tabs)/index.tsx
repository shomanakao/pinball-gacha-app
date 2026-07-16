import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import * as Matter from 'matter-js';

const { width, height } = Dimensions.get('window');

const BALL_RADIUS = 18;
const START_Y = 50;
const RESULT_LINE_Y = height - 130;

type PinType = 'normal' | 'evolution';

type PinData = {
  id: string;
  x: number;
  y: number;
  type: PinType;
};

const PIN_RADIUS = 8;

const INITIAL_PINS: PinData[] = [
  { id: 'pin-1', x: width * 0.25, y: 180, type: 'normal' },
  { id: 'pin-2', x: width * 0.5, y: 180, type: 'evolution' },
  { id: 'pin-3', x: width * 0.75, y: 180, type: 'normal' },

  { id: 'pin-4', x: width * 0.15, y: 250, type: 'normal' },
  { id: 'pin-5', x: width * 0.4, y: 250, type: 'normal' },
  { id: 'pin-6', x: width * 0.65, y: 250, type: 'evolution' },
  { id: 'pin-7', x: width * 0.9, y: 250, type: 'normal' },

  { id: 'pin-8', x: width * 0.25, y: 320, type: 'normal' },
  { id: 'pin-9', x: width * 0.5, y: 320, type: 'normal' },
  { id: 'pin-10', x: width * 0.75, y: 320, type: 'normal' },
];

type Rarity = 1 | 2 | 3;

export default function HomeScreen() {
  const engineRef = useRef<Matter.Engine | null>(null);
  const ballRef = useRef<Matter.Body | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [ballPosition, setBallPosition] = useState({
    x: width / 2,
    y: START_Y,
  });

  const [showResult, setShowResult] = useState(false);

  const [visiblePins, setVisiblePins] =
    useState<PinData[]>(INITIAL_PINS);

  const [rarity, setRarity] = useState<Rarity>(1);

    const getBallColor = () => {
      switch (rarity) {
        case 2:
          return '#facc15';
        case 3:
          return '#ec4899';
        default:
          return '#3b82f6';
      }
    };

  useEffect(() => {
    startGame();

    return () => {
      stopEngine();
    };
  }, []);

  const stopEngine = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const engine = engineRef.current;

    if (engine) {
      if (engine.world) {
        Matter.World.clear(engine.world, false);
      }

      Matter.Engine.clear(engine);
      engineRef.current = null;
    }

    ballRef.current = null;
  };

  const startGame = () => {
    stopEngine();

    setShowResult(false);
    setRarity(1);
    setVisiblePins([...INITIAL_PINS]);

    setBallPosition({
      x: width / 2,
      y: START_Y,
    });

    const pins = INITIAL_PINS.map((pin) =>
      Matter.Bodies.circle(
        pin.x,
        pin.y,
        PIN_RADIUS,
        {
          isStatic: true,
          isSensor: pin.type === 'evolution',
          restitution: pin.type === 'normal' ? 0.9 : 0,
          friction: 0,
          label: pin.type === 'normal'
            ? `normal-pin:${pin.id}`
            : `evolution-pin:${pin.id}`,
        }
      )
    );

    const WALL_WIDTH = 30;

    const leftWall = Matter.Bodies.rectangle(
      -WALL_WIDTH / 2,
      height / 2,
      WALL_WIDTH,
      height,
      {
        isStatic: true,
        restitution: 0.9,
        friction: 0,
        label: 'left-wall',
      }
    );

    const rightWall = Matter.Bodies.rectangle(
      width + WALL_WIDTH / 2,
      height / 2,
      WALL_WIDTH,
      height,
      {
        isStatic: true,
        restitution: 0.9,
        friction: 0,
        label: 'right-wall',
      }
    );

    const engine = Matter.Engine.create();

    engine.world.gravity.y = 1;

    const ball = Matter.Bodies.circle(
      width / 2,
      START_Y,
      BALL_RADIUS,
      {
        restitution: 0.75,
        friction: 0.01,
        frictionAir: 0.002,
        label: 'ball',
      }
    );

    Matter.World.add(engine.world, [
      ball,
      ...pins,
      leftWall,
      rightWall,
    ]);

    const removedPinIds = new Set<string>();

    const handleCollisionStart = (
      event: Matter.IEventCollision<Matter.Engine>
    ) => {
      event.pairs.forEach((pair) => {
        const bodies = [pair.bodyA, pair.bodyB];

        const ballBody = bodies.find(
          (body) => body.label === 'ball'
        );

        const pinBody = bodies.find(
          (body) =>
            body.label.startsWith('normal-pin:') ||
            body.label.startsWith('evolution-pin:')
        );

        if (!ballBody || !pinBody) return;

        const [, pinId] = pinBody.label.split(':');

        if (!pinId || removedPinIds.has(pinId)) return;

        removedPinIds.add(pinId);

        if (pinBody.label.startsWith('evolution-pin:')) {
          setRarity((currentRarity) => {
            if (currentRarity === 3) {
              return 3;
            }

            return (currentRarity + 1) as Rarity;
          });
        }

        setVisiblePins((currentPins) =>
          currentPins.filter((pin) => pin.id !== pinId)
        );

        requestAnimationFrame(() => {
          Matter.World.remove(engine.world, pinBody);
        });
      });
    };

    Matter.Events.on(
      engine,
      'collisionStart',
      handleCollisionStart
    );

    engineRef.current = engine;
    ballRef.current = ball;

    let lastTime = Date.now();

    const update = () => {
      const now = Date.now();
      const delta = Math.min(now - lastTime, 33);
      lastTime = now;

      Matter.Engine.update(engine, delta);

      setBallPosition({
        x: ball.position.x,
        y: ball.position.y,
      });

      if (ball.position.y >= RESULT_LINE_Y) {
        setShowResult(true);
        stopEngine();
        return;
      }

      animationFrameRef.current =
        requestAnimationFrame(update);
    };

    animationFrameRef.current =
      requestAnimationFrame(update);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pinball Gacha</Text>

      <View style={styles.gameArea}>
        {visiblePins.map((pin) => (
          <View
            key={pin.id}
            style={[
              styles.pin,
              pin.type === 'evolution'
                ? styles.evolutionPin
                : styles.normalPin,
              {
                left: pin.x - PIN_RADIUS,
                top: pin.y - PIN_RADIUS,
              },
            ]}
          />
        ))}

        {!showResult && (
          <View
            style={[
              styles.ball,
              {
                left: ballPosition.x - BALL_RADIUS,
                top: ballPosition.y - BALL_RADIUS,
                backgroundColor: getBallColor(),
              },
            ]}
          />
        )}

        <View style={styles.resultLine} />

        {showResult && (
          <View style={styles.resultOverlay}>
            <Text style={styles.resultTitle}>
              結果
            </Text>

            <View
              style={[
                styles.resultBall,
                {
                  backgroundColor: getBallColor(),
                },
              ]}
            />

            <Text style={styles.resultText}>
              レアリティ{rarity}
            </Text>

            <Pressable
              style={styles.retryButton}
              onPress={startGame}
            >
              <Text style={styles.retryButtonText}>
                もう一度
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
    paddingTop: 60,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  gameArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#dbeafe',
  },
  ball: {
    position: 'absolute',
    width: BALL_RADIUS * 2,
    height: BALL_RADIUS * 2,
    borderRadius: BALL_RADIUS,
    backgroundColor: '#3b82f6',
  },
  resultLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: RESULT_LINE_Y,
    height: 2,
    backgroundColor: '#94a3b8',
  },
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
  },
  resultTitle: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  resultBall: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#3b82f6',
    marginBottom: 18,
  },
  resultText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  retryButton: {
    marginTop: 28,
    backgroundColor: '#4f46e5',
    paddingHorizontal: 30,
    paddingVertical: 14,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  pin: {
    position: 'absolute',
    width: PIN_RADIUS * 2,
    height: PIN_RADIUS * 2,
    borderRadius: PIN_RADIUS,
  },

  normalPin: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#94a3b8',
  },

  evolutionPin: {
    backgroundColor: '#facc15',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#facc15',
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 0,
    },
  },
});