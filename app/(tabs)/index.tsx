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

const PIN_ROWS = 5;
const PINS_PER_ROW = 4;
const EVOLUTION_PIN_COUNT = 2;

const assignEvolutionPins = (
  pins: PinData[]
): PinData[] => {
  const shuffledIndexes = pins
    .map((_, index) => index)
    .sort(() => Math.random() - 0.5);

  const evolutionIndexes = new Set(
    shuffledIndexes.slice(0, EVOLUTION_PIN_COUNT)
  );

  return pins.map((pin, index) => ({
    ...pin,
    type: evolutionIndexes.has(index)
      ? 'evolution'
      : 'normal',
  }));
};

const createRandomPins = (): PinData[] => {
  const pins: PinData[] = [];

  for (let row = 0; row < PIN_ROWS; row += 1) {
    const rowY = 160 + row * 75;
    const isOffsetRow = row % 2 === 1;

    for (let column = 0; column < PINS_PER_ROW; column += 1) {
      const baseX =
        width * 0.14 +
        column * (width * 0.24) +
        (isOffsetRow ? width * 0.1 : 0);

      const randomX = Math.random() * 30 - 15;
      const randomY = Math.random() * 20 - 10;

      pins.push({
        id: `pin-${row}-${column}-${Date.now()}`,
        x: Math.min(
          width - PIN_RADIUS - 10,
          Math.max(PIN_RADIUS + 10, baseX + randomX)
        ),
        y: rowY + randomY,
        type: 'normal',
      });
    }
  }

  return assignEvolutionPins(pins);
};

const createRandomStartX = () => {
  const sidePadding = BALL_RADIUS + 30;

  return (
    sidePadding +
    Math.random() * (width - sidePadding * 2)
  );
};

const FIRST_PINS = createRandomPins();

type Rarity = 1 | 2 | 3;

export default function HomeScreen() {
  const engineRef = useRef<Matter.Engine | null>(null);
  const ballRef = useRef<Matter.Body | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const currentPinsRef =
    useRef<PinData[]>(FIRST_PINS);

  const [ballPosition, setBallPosition] = useState({
    x: width / 2,
    y: START_Y,
  });

  const [showResult, setShowResult] = useState(false);

  const [visiblePins, setVisiblePins] =
    useState<PinData[]>(FIRST_PINS);

  const [rarity, setRarity] = useState<Rarity>(1);

  const [hitPinIds, setHitPinIds] = useState<string[]>([]);

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

    const newPins = createRandomPins();
    const startX = createRandomStartX();

    currentPinsRef.current = newPins;

    setShowResult(false);
    setRarity(1);
    setVisiblePins(newPins);
    setHitPinIds([]);

    setBallPosition({
      x: startX,
      y: START_Y,
    });

    const pins = newPins.map((pin) =>
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
      startX,
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

        setHitPinIds((currentIds) => [
          ...currentIds,
          pinId,
        ]);

        setTimeout(() => {
          setVisiblePins((currentPins) =>
            currentPins.filter((pin) => pin.id !== pinId)
          );

          setHitPinIds((currentIds) =>
            currentIds.filter((id) => id !== pinId)
          );

          Matter.World.remove(engine.world, pinBody);
        }, 180);
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
        {visiblePins.map((pin) => {
          const isHit = hitPinIds.includes(pin.id);

          return (
            <View
              key={pin.id}
              style={[
                styles.pin,
                pin.type === 'evolution'
                  ? styles.evolutionPin
                  : styles.normalPin,
                isHit && styles.hitPin,
                {
                  left: pin.x - PIN_RADIUS,
                  top: pin.y - PIN_RADIUS,
                  transform: [
                    {
                      scale: isHit ? 1.7 : 1,
                    },
                  ],
                },
              ]}
            />
          );
        })}

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
  hitPin: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 12,
  },
});