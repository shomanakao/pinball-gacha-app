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

const UPGRADE_PIN_SLOW_DISTANCE = 80;

const NORMAL_TIME_SCALE = 1;
const SLOW_TIME_SCALE = 0.35;

type PinType = 'normal' | 'gold' | 'rainbow';
type UpgradePinType = 'gold' | 'rainbow';

type Rarity = 'white' | 'gold' | 'rainbow';

const getPinTypeFromLabel = (
  label: string
): PinType | null => {
  if (label.startsWith('normal-pin:')) {
    return 'normal';
  }

  if (label.startsWith('gold-pin:')) {
    return 'gold';
  }

  if (label.startsWith('rainbow-pin:')) {
    return 'rainbow';
  }

  return null;
};

const evolveRarity = (
  currentRarity: Rarity,
  pinType: UpgradePinType
): Rarity => {
  if (currentRarity === 'rainbow') {
    return 'rainbow';
  }

  if (pinType === 'rainbow') {
    return 'rainbow';
  }

  if (currentRarity === 'gold') {
    return 'rainbow';
  }

  return 'gold';
};

type PinData = {
  id: string;
  x: number;
  y: number;
  type: PinType;
};

const PIN_RADIUS = 8;

const PIN_ROWS = 5;
const PINS_PER_ROW = 4;
const GOLD_PIN_COUNT = 3;
const RAINBOW_PIN_COUNT = 1;

const assignUpgradePins = (
  pins: PinData[]
): PinData[] => {
  const shuffledIndexes = pins
    .map((_, index) => index)
    .sort(() => Math.random() - 0.5);

  const rainbowIndexes = new Set(
    shuffledIndexes.slice(0, RAINBOW_PIN_COUNT)
  );

  const goldIndexes = new Set(
    shuffledIndexes.slice(
      RAINBOW_PIN_COUNT,
      RAINBOW_PIN_COUNT + GOLD_PIN_COUNT
    )
  );

  return pins.map((pin, index) => {
    if (rainbowIndexes.has(index)) {
      return {
        ...pin,
        type: 'rainbow',
      };
    }

    if (goldIndexes.has(index)) {
      return {
        ...pin,
        type: 'gold',
      };
    }

    return {
      ...pin,
      type: 'normal',
    };
  });
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

  return assignUpgradePins(pins);
};

const createRandomStartX = () => {
  const sidePadding = BALL_RADIUS + 30;

  return (
    sidePadding +
    Math.random() * (width - sidePadding * 2)
  );
};

const FIRST_PINS = createRandomPins();

export default function HomeScreen() {
  const engineRef = useRef<Matter.Engine | null>(null);
  const ballRef = useRef<Matter.Body | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isSlowMotionRef = useRef(false);
  const spotlightPinIdRef = useRef<string | null>(null);

  const currentPinsRef =
    useRef<PinData[]>(FIRST_PINS);

  const [ballPosition, setBallPosition] = useState({
    x: width / 2,
    y: START_Y,
  });

  const [showResult, setShowResult] = useState(false);

  const [visiblePins, setVisiblePins] = useState<PinData[]>(FIRST_PINS);

  const [rarity, setRarity] =
    useState<Rarity>('white');

  const rarityRef = useRef<Rarity>('white');

  const [hitPinIds, setHitPinIds] = useState<string[]>([]);

  const [isSpotlightActive, setIsSpotlightActive] =
    useState(false);

  const [spotlightPin, setSpotlightPin] = useState<{
    id: string;
    x: number;
    y: number;
    type: 'gold' | 'rainbow';
  } | null>(null);

  const getBallColor = () => {
    switch (rarity) {
      case 'gold':
        return '#facc15';

      case 'rainbow':
        return '#f472b6';

      default:
        return '#f8fafc';
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

    isSlowMotionRef.current = false;
    spotlightPinIdRef.current = null;

    setIsSpotlightActive(false);
    setSpotlightPin(null);
  };

  const startGame = () => {
    stopEngine();

    const newPins = createRandomPins();
    const startX = createRandomStartX();

    currentPinsRef.current = newPins;

    setShowResult(false);

    rarityRef.current = 'white';
    setRarity('white');

    isSlowMotionRef.current = false;
    spotlightPinIdRef.current = null;

    setIsSpotlightActive(false);
    setSpotlightPin(null);

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

          // 金と虹はすり抜ける
          isSensor: pin.type !== 'normal',

          restitution:
            pin.type === 'normal' ? 0.9 : 0,

          friction: 0,

          label: `${pin.type}-pin:${pin.id}`,
        }
      )
    );

    const pinBodiesById = new Map<
      string,
      Matter.Body
    >();

    pins.forEach((pinBody) => {
      const [, pinId] = pinBody.label.split(':');

      if (pinId) {
        pinBodiesById.set(pinId, pinBody);
      }
    });

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
            getPinTypeFromLabel(body.label) !== null
        );

        if (!ballBody || !pinBody) return;

        if (rarityRef.current === 'rainbow') {
          return;
        }

        const [, pinId] = pinBody.label.split(':');

        if (!pinId || removedPinIds.has(pinId)) return;

        const pinType = getPinTypeFromLabel(
          pinBody.label
        );

        if (!pinType) {
          return;
        }

        const isUpgradePin =
          pinType === 'gold' ||
          pinType === 'rainbow';

        if (isUpgradePin) {
          engine.timing.timeScale = NORMAL_TIME_SCALE;

          isSlowMotionRef.current = false;
          spotlightPinIdRef.current = null;

          setIsSpotlightActive(false);
          setSpotlightPin(null);
        }

        removedPinIds.add(pinId);

        if (isUpgradePin) {
          setRarity((currentRarity) => {
            const nextRarity = evolveRarity(
              currentRarity,
              pinType
            );

            rarityRef.current = nextRarity;

            const becameRainbow =
              currentRarity !== 'rainbow' &&
              nextRarity === 'rainbow';

            if (becameRainbow) {
              setTimeout(() => {
                setVisiblePins([]);
                setHitPinIds([]);

                pinBodiesById.forEach((body) => {
                  Matter.World.remove(
                    engine.world,
                    body
                  );
                });

                pinBodiesById.clear();
              }, 180);
            }

            return nextRarity;
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

          pinBodiesById.delete(pinId);
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

    const updateSlowMotion = () => {
      if (rarityRef.current === 'rainbow') {
        if (isSlowMotionRef.current) {
          engine.timing.timeScale =
            NORMAL_TIME_SCALE;

          isSlowMotionRef.current = false;
        }

        if (spotlightPinIdRef.current !== null) {
          spotlightPinIdRef.current = null;

          setIsSpotlightActive(false);
          setSpotlightPin(null);
        }

        return;
      }

      let nearestUpgradePin: {
        id: string;
        body: Matter.Body;
        type: UpgradePinType;
        distance: number;
      } | null = null;

      for (const [pinId, pinBody] of pinBodiesById) {
        if (removedPinIds.has(pinId)) {
          continue;
        }

        const pinType = getPinTypeFromLabel(
          pinBody.label
        );

        if (
          pinType !== 'gold' &&
          pinType !== 'rainbow'
        ) {
          continue;
        }

        const distanceX =
          ball.position.x - pinBody.position.x;

        const distanceY =
          ball.position.y - pinBody.position.y;

        const distance = Math.sqrt(
          distanceX * distanceX +
          distanceY * distanceY
        );

        if (
          nearestUpgradePin === null ||
          distance < nearestUpgradePin.distance
        ) {
          nearestUpgradePin = {
            id: pinId,
            body: pinBody,
            type: pinType,
            distance,
          };
        }
      }

      if (
        nearestUpgradePin === null ||
        nearestUpgradePin.distance >
          UPGRADE_PIN_SLOW_DISTANCE
      ) {
        if (isSlowMotionRef.current) {
          engine.timing.timeScale =
            NORMAL_TIME_SCALE;

          isSlowMotionRef.current = false;
        }

        if (spotlightPinIdRef.current !== null) {
          spotlightPinIdRef.current = null;

          setIsSpotlightActive(false);
          setSpotlightPin(null);
        }

        return;
      }

      if (!isSlowMotionRef.current) {
        engine.timing.timeScale =
          SLOW_TIME_SCALE;

        isSlowMotionRef.current = true;
      }

      if (
        spotlightPinIdRef.current !==
        nearestUpgradePin.id
      ) {
        spotlightPinIdRef.current =
          nearestUpgradePin.id;

        setSpotlightPin({
          id: nearestUpgradePin.id,
          x: nearestUpgradePin.body.position.x,
          y: nearestUpgradePin.body.position.y,
          type: nearestUpgradePin.type,
        });
      }

      setIsSpotlightActive(true);
    };

    const update = () => {
      const now = Date.now();
      const delta = Math.min(now - lastTime, 33);
      lastTime = now;

      updateSlowMotion();

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
                pin.type === 'gold' && styles.goldPin,
                pin.type === 'rainbow' && styles.rainbowPin,
                pin.type === 'normal' && styles.normalPin,
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

        {isSpotlightActive &&
          spotlightPin &&
          !showResult && (
            <View
              pointerEvents="none"
              style={styles.spotlightLayer}
            >
              <View style={styles.darkOverlay} />

              <View
                style={[
                  styles.ballSpotlightGlow,
                  {
                    left:
                      ballPosition.x -
                      BALL_RADIUS * 1.6,
                    top:
                      ballPosition.y -
                      BALL_RADIUS * 1.6,
                  },
                ]}
              />

              <View
                style={[
                  styles.spotlightBall,
                  {
                    left:
                      ballPosition.x -
                      BALL_RADIUS,
                    top:
                      ballPosition.y -
                      BALL_RADIUS,
                    backgroundColor:
                      getBallColor(),
                  },
                ]}
              />

              <View
                style={[
                  styles.pinSpotlightGlow,
                  spotlightPin.type ===
                  'rainbow'
                    ? styles.rainbowSpotlightGlow
                    : styles.goldSpotlightGlow,
                  {
                    left:
                      spotlightPin.x -
                      PIN_RADIUS * 4,
                    top:
                      spotlightPin.y -
                      PIN_RADIUS * 4,
                  },
                ]}
              />

              <View
                style={[
                  styles.lightBeam,
                  styles.lightBeamVertical,
                  {
                    left: spotlightPin.x - 4,
                    top: spotlightPin.y - 110,
                  },
                ]}
              />

              <View
                style={[
                  styles.lightBeam,
                  styles.lightBeamHorizontal,
                  {
                    left: spotlightPin.x - 110,
                    top: spotlightPin.y - 4,
                  },
                ]}
              />

              <View
                style={[
                  styles.lightBeam,
                  styles.lightBeamDiagonal,
                  {
                    left: spotlightPin.x - 3.5,
                    top: spotlightPin.y - 85,
                    transform: [
                      {
                        rotate: '45deg',
                      },
                    ],
                  },
                ]}
              />

              <View
                style={[
                  styles.lightBeam,
                  styles.lightBeamDiagonal,
                  {
                    left: spotlightPin.x - 3.5,
                    top: spotlightPin.y - 85,
                    transform: [
                      {
                        rotate: '-45deg',
                      },
                    ],
                  },
                ]}
              />

              <View
                style={[
                  styles.spotlightPin,
                  spotlightPin.type ===
                  'rainbow'
                    ? styles.rainbowSpotlightPin
                    : styles.goldSpotlightPin,
                  {
                    left:
                      spotlightPin.x -
                      PIN_RADIUS,
                    top:
                      spotlightPin.y -
                      PIN_RADIUS,
                  },
                ]}
              />
            </View>
        )}

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
              {rarity === 'white' && '白'}
              {rarity === 'gold' && '金'}
              {rarity === 'rainbow' && '虹'}
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

  goldPin: {
    backgroundColor: '#facc15',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#facc15',
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 10,
  },

  rainbowPin: {
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: '#ec4899',
    shadowColor: '#22d3ee',
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 14,
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
  spotlightLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },

  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },

  ballSpotlightGlow: {
    position: 'absolute',
    width: BALL_RADIUS * 3.2,
    height: BALL_RADIUS * 3.2,
    borderRadius: BALL_RADIUS * 1.6,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    shadowColor: '#ffffff',
    shadowOpacity: 0.9,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 20,
  },

  spotlightBall: {
    position: 'absolute',
    width: BALL_RADIUS * 2,
    height: BALL_RADIUS * 2,
    borderRadius: BALL_RADIUS,
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 25,
  },

  pinSpotlightGlow: {
    position: 'absolute',
    width: PIN_RADIUS * 8,
    height: PIN_RADIUS * 8,
    borderRadius: PIN_RADIUS * 4,
    shadowOpacity: 1,
    shadowRadius: 40,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 30,
  },

  goldSpotlightGlow: {
    backgroundColor: 'rgba(255, 255, 180, 0.18)',
    shadowColor: '#ffe600',
  },

  rainbowSpotlightGlow: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: '#ff4fd8',
  },

  spotlightPin: {
    position: 'absolute',
    width: PIN_RADIUS * 2,
    height: PIN_RADIUS * 2,
    borderRadius: PIN_RADIUS,
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 25,
  },

  goldSpotlightPin: {
    backgroundColor: '#facc15',
    shadowColor: '#facc15',
  },

  rainbowSpotlightPin: {
    backgroundColor: '#f472b6',
    shadowColor: '#f472b6',
  },
  lightBeam: {
    position: 'absolute',
    backgroundColor: '#ffe600',
    shadowColor: '#ffe600',
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 40,
    opacity: 0.9,
  },

  lightBeamVertical: {
    width: 8,
    height: 220,
    borderRadius: 8,
  },

  lightBeamHorizontal: {
    width: 220,
    height: 8,
    borderRadius: 8,
  },

  lightBeamDiagonal: {
    width: 7,
    height: 170,
    borderRadius: 8,
  },
});