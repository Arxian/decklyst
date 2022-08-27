import { getImageDataUri } from '@/common/getImageDataUri'
import { trpc } from '@/common/trpc'
import { deckImageUrl } from '@/common/urls'
import { DeckInfograph } from '@/components/DeckInfograph'
import { DeckMetadata } from '@/components/DeckMetadata'
import {
  BuildIcon,
  CopyIcon,
  DoneIcon,
  DownloadDoneIcon,
  DownloadIcon,
  LinkIcon,
} from '@/components/Icons'
import { OneTimeButton } from '@/components/OneTimeButton'
import { DeckProvider } from '@/context/useDeck'
import { SpriteLoaderProvider } from '@/context/useSpriteLoader'
import type { Deck } from '@/data/deck'
import { createDeck, deckcodeWithoutTitle$, faction$, title$ } from '@/data/deck'
import { validateDeckcode } from '@/data/deckcode'
import { createSsrClient } from '@/server'
import { getIpAddress } from '@/server/utils'
import Link from 'next/link'
import type { GetServerSidePropsContext } from 'next/types'
import type { FC } from 'react'
import React, { useMemo } from 'react'
import { useQuery } from 'react-query'
import { BounceLoader } from 'react-spinners'
import colors from 'tailwindcss/colors'

type Props = { deck: Deck; meta: { sharecode?: string }; isSnapshot: boolean }

const DeckPage: FC<Props> = ({ deck, meta, isSnapshot }) => {
  const [imageDataUri, setImageDataUri] = React.useState<string | null>(null)

  const deckcode = deck.deckcode
  const imageFilename = useMemo(
    () => `${title$(deck)}_${faction$(deck)}_${deckcodeWithoutTitle$(deck)}.png`,
    [deck],
  )

  const { mutateAsync: ensureDeckimage } = trpc.useMutation('ensureDeckimage')
  const { refetch: refetchDeckimage } = useQuery(
    ['deck-image', deckcode],
    async () => {
      const image = await ensureDeckimage({ deckcode })

      return getImageDataUri(image)
    },
    {
      enabled: !isSnapshot,
      staleTime: Infinity,
      retry: true,
      retryDelay: (retryCount) => 1000 * Math.pow(2, Math.max(0, retryCount - 5)),
      onSuccess: (dataUri) => setImageDataUri(dataUri),
    },
  )

  const copyDeckcode = async () => {
    if (deckcode) {
      await navigator.clipboard.writeText(deckcode)
    }
  }
  const copyImageUrl = async () => {
    if (deckcode) {
      await navigator.clipboard.writeText(deckImageUrl(deckcode))
    }
  }

  const handleRegenerateClick = () => async () => {
    setImageDataUri(null)
    try {
      const image = await ensureDeckimage({ deckcode, forceRender: true })
      setImageDataUri(getImageDataUri(image))
    } catch (e) {
      await refetchDeckimage()
    }
  }

  if (!deck) return null

  return (
    <DeckProvider deck={deck} meta={meta}>
      <SpriteLoaderProvider deck={deck} key={deck.deckcode}>
        <div className="flex flex-col flex-1 overflow-y-auto">
          <div className="content-container my-8">
            <DeckMetadata />
            <DeckInfograph />
            <div className="mt-6 grid grid-cols-3 auto-cols-auto grid-rows-2 gap-4">
              <OneTimeButton onClick={copyDeckcode} timeout={2500} className="btn--large">
                {(copied) => (
                  <>
                    {copied ? <DoneIcon /> : <CopyIcon />}
                    Copy deckcode
                  </>
                )}
              </OneTimeButton>
              <OneTimeButton onClick={copyImageUrl} timeout={2500} className="btn--large">
                {(copied) => (
                  <>
                    {copied ? <DoneIcon /> : <LinkIcon />}
                    Copy image url
                  </>
                )}
              </OneTimeButton>
              <OneTimeButton
                href={imageDataUri ?? undefined}
                download={imageFilename}
                disabled={!imageDataUri}
                className="btn--large"
              >
                {(isDownloading) =>
                  imageDataUri ? (
                    <>
                      {isDownloading ? <DownloadDoneIcon /> : <DownloadIcon />}
                      Download image
                    </>
                  ) : (
                    <>
                      <BounceLoader
                        size={18}
                        speedMultiplier={0.66}
                        color={colors.gray['400']}
                        className="mr-2"
                      />
                      <span className="text-gray-400">Generating image</span>
                    </>
                  )
                }
              </OneTimeButton>
              <Link href={{ pathname: '/build/[deckcode]', query: { deckcode: deck.deckcode } }}>
                <a className="btn btn--large">
                  <BuildIcon />
                  Open in deckbuilder
                </a>
              </Link>
              <div />
              <div className="flex gap-x-2 justify-end items-center text-gray-500 text-sm -mt-8">
                <span>Image broken?</span>
                <button
                  disabled={!imageDataUri}
                  onClick={handleRegenerateClick()}
                  className="text-gray-400 hover:text-teal-400 disabled:hover:text-gray-400"
                >
                  Regenerate
                </button>
              </div>
            </div>
          </div>
        </div>
      </SpriteLoaderProvider>
    </DeckProvider>
  )
}

export const getServerSideProps = async ({ req, query }: GetServerSidePropsContext) => {
  const code = query.code as string | undefined
  const snapshot = +((query.snapshot as string | undefined) ?? '0') === 1

  const client = await createSsrClient()

  let deckcode = code
  let sharecode = null

  if (code) {
    const deck = snapshot
      ? await client.query('getDeckinfo', { code })
      : await client.mutation('ensureDeckinfo', { code })

    deckcode = deck?.deckcode ?? deckcode
    sharecode = deck?.sharecode ?? sharecode
  }

  if (!validateDeckcode(deckcode)) {
    return { notFound: true }
  }

  const deck = createDeck(deckcode)

  if (deck.cards.length === 0) {
    return { notFound: true }
  }

  if (!snapshot) {
    await client.mutation('registerView', {
      deckcode: deckcode!,
      ipAddress: getIpAddress(req),
    })
  }

  return {
    props: {
      deck,
      meta: { sharecode },
      isSnapshot: Boolean(+snapshot),
    },
  }
}

export default DeckPage
