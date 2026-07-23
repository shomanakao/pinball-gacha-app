import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { LinearGradient } from 'expo-linear-gradient';
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

type BeamProps = {
  centerX: number;
  centerY: number;
  angle: number;
  length: number;
  rainbow: boolean;
  opacity: Animated.AnimatedInterpolation<number>;
  scale: Animated.AnimatedInterpolation<number>;
};

function Beam({
  centerX,
  centerY,
  angle,
  length,
  rainbow,
  opacity,
  scale,
}: BeamProps) {
  const width = rainbow ? 22 : 18;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width,
        height: length,
        left: centerX - width / 2,
        top: centerY - length / 2,
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
        transform: [
          {
            rotate: `${angle}deg`,
          },
          {
            scaleY: scale,
          },
        ],
      }}
    >
      <Svg
        width={width}
        height={length}
      >
        {/* 外側 */}
        <Polygon
          points={`
            ${width / 2},0
            ${width},${length / 2}
            ${width / 2},${length}
            0,${length / 2}
          `}
          fill={
            rainbow
              ? 'rgba(255,255,255,0.18)'
              : 'rgba(255,235,120,0.22)'
          }
        />

        {/* 中間 */}
        <Polygon
          points={`
            ${width / 2},${length * 0.1}
            ${width * 0.82},${length / 2}
            ${width / 2},${length * 0.9}
            ${width * 0.18},${length / 2}
          `}
          fill={
            rainbow
              ? 'rgba(170,240,255,0.55)'
              : 'rgba(255,250,200,0.58)'
          }
        />

        {/* 白い芯 */}
        <Polygon
          points={`
            ${width / 2},${length * 0.22}
            ${width * 0.62},${length / 2}
            ${width / 2},${length * 0.78}
            ${width * 0.38},${length / 2}
          `}
          fill="white"
        />
      </Svg>
    </Animated.View>
  );
}

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

  const lightBeamAnimation = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    if (!isSpotlightActive || !spotlightPin) {
      lightBeamAnimation.stopAnimation();
      lightBeamAnimation.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(lightBeamAnimation, {
          toValue: 1,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(lightBeamAnimation, {
          toValue: 0,
          duration: 450,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [
    isSpotlightActive,
    spotlightPin,
    lightBeamAnimation,
  ]);

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

  const lightBeamOpacity = lightBeamAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0.95],
  });

  const lightBeamScale = lightBeamAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1.08],
  });

  const pinCoreScale = lightBeamAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.15],
  });

  const pinCoreOpacity = lightBeamAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.75, 1],
  });

  const particleOpacity = lightBeamAnimation.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [1, 0.7, 0.15],
  });

  const particleDistance = lightBeamAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 42],
  });

  const particleRotation = lightBeamAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '12deg'],
  });

  const spotlightBeamConfigs =
    spotlightPin?.type === 'rainbow'
      ? [
          { angle: 0, length: 190 },
          { angle: 22.5, length: 155 },
          { angle: 45, length: 175 },
          { angle: 67.5, length: 150 },
          { angle: 90, length: 185 },
          { angle: 112.5, length: 160 },
          { angle: 135, length: 170 },
          { angle: 157.5, length: 150 },
        ]
      : [
          { angle: 0, length: 180 },
          { angle: 30, length: 145 },
          { angle: 60, length: 160 },
          { angle: 90, length: 175 },
          { angle: 120, length: 150 },
          { angle: 150, length: 165 },
        ];

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

              {/* ピンの大きなぼかし */}
              <Animated.View
                style={{
                  position: 'absolute',
                  left: spotlightPin.x - 55,
                  top: spotlightPin.y - 55,
                  width: 110,
                  height: 110,
                  borderRadius: 55,
                  backgroundColor:
                    spotlightPin.type === 'rainbow'
                      ? 'rgba(255,255,255,0.16)'
                      : 'rgba(255,245,180,0.12)',
                  opacity: lightBeamOpacity,
                }}
              />

              {/* ピンの中心発光 */}
              <Animated.View
                style={{
                  position: 'absolute',
                  left: spotlightPin.x - 24,
                  top: spotlightPin.y - 24,
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  overflow: 'hidden',
                  opacity: lightBeamOpacity,
                }}
              >
                {spotlightPin.type === 'rainbow' ? (
                  <LinearGradient
                    colors={[
                      'rgba(255,255,255,0)',
                      'rgba(120,255,255,0.28)',
                      'rgba(255,255,255,0.82)',
                      'rgba(255,140,255,0.30)',
                      'rgba(255,255,255,0)',
                    ]}
                    locations={[0, 0.28, 0.5, 0.72, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: 24,
                    }}
                  />
                ) : (
                  <LinearGradient
                    colors={[
                      'rgba(255,255,255,0)',
                      'rgba(255,245,180,0.30)',
                      'rgba(255,255,255,0.88)',
                      'rgba(255,230,120,0.30)',
                      'rgba(255,255,255,0)',
                    ]}
                    locations={[0, 0.28, 0.5, 0.72, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: 24,
                    }}
                  />
                )}
              </Animated.View>

              {/* ピンの白いコア */}
              <Animated.View
                style={{
                  position: 'absolute',
                  left: spotlightPin.x - 8,
                  top: spotlightPin.y - 8,
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: '#FFFFFF',
                  shadowColor: '#FFFFFF',
                  shadowOpacity: 1,
                  shadowRadius: 12,
                  opacity: Animated.multiply(
                    lightBeamOpacity,
                    0.95
                  ),
                }}
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

              {/* 中心から放射するSVG光線 */}
              {spotlightBeamConfigs.map((beam, index) => (
                <Beam
                  key={`${beam.angle}-${index}`}
                  centerX={spotlightPin.x}
                  centerY={spotlightPin.y}
                  angle={beam.angle}
                  length={beam.length}
                  rainbow={spotlightPin.type === 'rainbow'}
                  opacity={lightBeamOpacity}
                  scale={lightBeamScale}
                />
              ))}

              <Animated.View
                pointerEvents="none"
                style={[
                  styles.particleGroup,
                  {
                    left: spotlightPin.x,
                    top: spotlightPin.y,
                    transform: [
                      {
                        rotate: particleRotation,
                      },
                    ],
                  },
                ]}
              >
                {[
                  { x: -1, y: 0 },
                  { x: 1, y: 0 },
                  { x: 0, y: -1 },
                  { x: 0, y: 1 },
                ].map((particle, index) => (
                  <Animated.View
                    key={index}
                    style={[
                      styles.lightParticle,
                      spotlightPin.type === 'rainbow'
                        ? styles.rainbowParticle
                        : styles.goldParticle,
                      {
                        opacity: particleOpacity,
                        transform: [
                          {
                            translateX:
                              particle.x === 0
                                ? 0
                                : particle.x > 0
                                  ? particleDistance
                                  : Animated.multiply(particleDistance, -1),
                          },
                          {
                            translateY:
                              particle.y === 0
                                ? 0
                                : particle.y > 0
                                  ? particleDistance
                                  : Animated.multiply(particleDistance, -1),
                          },
                          {
                            scale: pinCoreScale,
                          },
                        ],
                      },
                    ]}
                  />
                ))}
              </Animated.View>

              <Animated.View
                style={[
                  styles.pinCoreGlow,
                  spotlightPin.type === 'rainbow'
                    ? styles.rainbowCoreGlow
                    : styles.goldCoreGlow,
                  {
                    left: spotlightPin.x - 14,
                    top: spotlightPin.y - 14,
                    opacity: particleOpacity,
                    transform: [
                      {
                        scale: pinCoreScale,
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

  pinCoreGlow: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 50,
  },

  goldCoreGlow: {
    backgroundColor: 'rgba(255,255,230,0.95)',
    shadowColor: '#fff59d',
  },

  rainbowCoreGlow: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#ff6ad5',
  },

  lightParticle: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    shadowOpacity: 1,
    shadowRadius: 18,
    left: -2,
    top: -2,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 60,
  },

  goldParticle: {
    backgroundColor: '#fff7b3',
    shadowColor: '#ffe600',
  },

  rainbowParticle: {
    backgroundColor: '#ffffff',
    shadowColor: '#ff6ad5',
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

  lightBeamGlow: {
    position: 'absolute',
    opacity: 0.45,
    elevation: 15,
  },

  lightBeamVertical: {
    width: 6,
    height: 220,
    borderRadius: 8,
  },

  lightBeamVerticalCore: {
    width: 4,
    height: 170,
    borderRadius: 8,
  },

  lightBeamHorizontalCore: {
    width: 170,
    height: 4,
    borderRadius: 8,
  },

  lightBeamDiagonalCore: {
    width: 4,
    height: 135,
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

  particleGroup: {
    position: 'absolute',
    width: 0,
    height: 0,
    overflow: 'visible',
    zIndex: 60,
  },
});