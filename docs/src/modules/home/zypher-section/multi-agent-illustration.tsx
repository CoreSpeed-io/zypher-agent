import type { ComponentProps } from 'react'

export function MultiAgentIllustration(props: ComponentProps<'svg'>) {
  return (
    <svg width={340} height={223} viewBox='0 0 340 223' fill='none' xmlns='http://www.w3.org/2000/svg' {...props}>
      <mask
        id='mask0_603_9516'
        style={{
          maskType: 'alpha',
        }}
        maskUnits='userSpaceOnUse'
        x={0}
        y={0}
        width={340}
        height={223}
      >
        <rect width={340} height={223} fill='url(#paint0_linear_603_9516)' />
      </mask>
      <g mask='url(#mask0_603_9516)'>
        <g filter='url(#filter0_d_603_9516)' data-figma-bg-blur-radius={8}>
          <path
            d='M22 29C22 25.6863 24.6863 23 28 23H136C139.314 23 142 25.6863 142 29V51C142 54.3137 139.314 57 136 57H28C24.6863 57 22 54.3137 22 51V29Z'
            fill='white'
          />
          <path
            d='M28 23.3496H136C139.12 23.3496 141.65 25.8796 141.65 29V51C141.65 54.1204 139.12 56.6504 136 56.6504H28C24.8796 56.6504 22.3496 54.1204 22.3496 51V29C22.3496 25.8796 24.8796 23.3496 28 23.3496Z'
            stroke='#D4D4D4'
            strokeWidth={0.7}
          />
          <path d='M50 32V48H34V32H50Z' fill='white' fillOpacity={0.01} />
          <path
            d='M38.5321 38.6665L38.2397 38.821C37.2596 39.3391 36.7696 39.5981 36.7696 39.9998C36.7696 40.4015 37.2596 40.6605 38.2397 41.1786L39.5073 41.8486C40.7279 42.4939 41.3382 42.8165 41.9997 42.8165C42.6611 42.8165 43.2714 42.4939 44.4921 41.8486L45.7596 41.1786C46.7397 40.6605 47.2298 40.4015 47.2298 39.9998C47.2298 39.5981 46.7397 39.3391 45.7596 38.821L45.4673 38.6665M38.5321 41.3331L38.2397 41.4877C37.2596 42.0058 36.7696 42.2648 36.7696 42.6665C36.7696 43.0682 37.2596 43.3272 38.2397 43.8453L39.5073 44.5153C40.7279 45.1605 41.3382 45.4831 41.9997 45.4831C42.6611 45.4831 43.2714 45.1605 44.4921 44.5153L45.7596 43.8453C46.7397 43.3272 47.2298 43.0682 47.2298 42.6665C47.2298 42.2648 46.7397 42.0058 45.7596 41.4877L45.4673 41.3331M38.2397 38.5116L39.5072 39.1816C40.7279 39.8268 41.3382 40.1494 41.9996 40.1494C42.6611 40.1494 43.2714 39.8268 44.492 39.1816L45.7596 38.5116C46.7397 37.9935 47.2297 37.7344 47.2297 37.3328C47.2297 36.9311 46.7397 36.6721 45.7596 36.154L44.492 35.484C43.2714 34.8387 42.6611 34.5161 41.9996 34.5161C41.3382 34.5161 40.7279 34.8387 39.5072 35.484L38.2397 36.154C37.2596 36.6721 36.7695 36.9311 36.7695 37.3328C36.7695 37.7344 37.2596 37.9935 38.2397 38.5116Z'
            stroke='#0A0A0A'
            strokeLinejoin='round'
            className='group-hover:stroke-brand-base transition-[stroke]'
          />
          <text
            fill='#0A0A0A'
            xmlSpace='preserve'
            style={{
              whiteSpace: 'pre',
            }}
            fontFamily='Berkeley Mono, monospace'
            fontSize={12}
            letterSpacing='0.01em'
          >
            <tspan x={56} y={44.272}>
              Task Input
            </tspan>
          </text>
        </g>
        <g filter='url(#filter1_d_603_9516)'>
          <rect x={78} y={74.75} width={235} height={42} rx={6} fill='white' />
          <rect x={78.35} y={75.1} width={234.3} height={41.3} rx={5.65} stroke='#D4D4D4' strokeWidth={0.7} />
          <g clipPath='url(#clip1_603_9516)'>
            <rect x={90} y={86.75} width={16} height={16} rx={2} fill='#FEF4EE' />
            <path d='M115 87.75V111.75H91V87.75H115Z' fill='white' fillOpacity={0.01} />
            <path
              d='M99.7497 95.0417C99.7497 96.1692 98.8356 97.0833 97.708 97.0833C96.5804 97.0833 95.6663 96.1692 95.6663 95.0417C95.6663 93.9141 96.5804 93 97.708 93C98.8356 93 99.7497 93.9141 99.7497 95.0417ZM99.7497 95.0417H101.5M101.5 95.0417C101.5 95.5249 101.891 95.9167 102.375 95.9167C102.858 95.9167 103.25 95.5249 103.25 95.0417C103.25 94.5584 102.858 94.1667 102.375 94.1667C101.891 94.1667 101.5 94.5584 101.5 95.0417ZM94.8803 92.6851L96.1396 93.7345M98.7972 91.7737L98.3537 93.1042M100.006 97.9229L98.8304 96.7474M95.3024 97.9867L96.4298 96.6338M100.333 90.6667C100.333 91.311 99.8107 91.8333 99.1663 91.8333C98.522 91.8333 97.9997 91.311 97.9997 90.6667C97.9997 90.0223 98.522 89.5 99.1663 89.5C99.8107 89.5 100.333 90.0223 100.333 90.6667ZM101.5 98.5417C101.5 99.0249 101.108 99.4167 100.625 99.4167C100.141 99.4167 99.7497 99.0249 99.7497 98.5417C99.7497 98.0584 100.141 97.6667 100.625 97.6667C101.108 97.6667 101.5 98.0584 101.5 98.5417ZM95.083 92.125C95.083 92.6082 94.6913 93 94.208 93C93.7248 93 93.333 92.6082 93.333 92.125C93.333 91.6418 93.7248 91.25 94.208 91.25C94.6913 91.25 95.083 91.6418 95.083 92.125ZM95.6663 98.8333C95.6663 99.4777 95.144 100 94.4997 100C93.8553 100 93.333 99.4777 93.333 98.8333C93.333 98.189 93.8553 97.6667 94.4997 97.6667C95.144 97.6667 95.6663 98.189 95.6663 98.8333Z'
              stroke='#F2572B'
            />
          </g>
          <text
            fill='#0A0A0A'
            xmlSpace='preserve'
            style={{
              whiteSpace: 'pre',
            }}
            fontFamily='Berkeley Mono, monospace'
            fontSize={12}
            letterSpacing='0.01em'
          >
            <tspan x={114} y={100.022}>
              Planner
            </tspan>
          </text>
          <rect x={263} y={86.75} width={38} height={17} rx={8.5} fill='#F5F5F5' />
          <text
            fill='#404040'
            xmlSpace='preserve'
            style={{
              whiteSpace: 'pre',
            }}
            fontFamily='Berkeley Mono, monospace'
            fontSize={10}
            letterSpacing='-0.01em'
          >
            <tspan x={267} y={98.81}>
              Agent
            </tspan>
          </text>
        </g>
        <g filter='url(#filter2_d_603_9516)'>
          <rect x={78} y={127.75} width={235} height={42} rx={6} fill='white' />
          <rect x={78.35} y={128.1} width={234.3} height={41.3} rx={5.65} stroke='#D4D4D4' strokeWidth={0.7} />
          <g clipPath='url(#clip2_603_9516)'>
            <rect x={90} y={139.75} width={16} height={16} rx={2} fill='#FEF4EE' />
            <path d='M115 140.75V164.75H91V140.75H115Z' fill='white' fillOpacity={0.01} />
            <path
              d='M99.458 149.208L102.666 152.416M100.333 146.583C100.333 148.516 98.766 150.083 96.833 150.083C94.9 150.083 93.333 148.516 93.333 146.583C93.333 144.65 94.9 143.083 96.833 143.083C98.766 143.083 100.333 144.65 100.333 146.583Z'
              stroke='#F2572B'
              strokeLinecap='square'
            />
          </g>
          <text
            fill='#0A0A0A'
            xmlSpace='preserve'
            style={{
              whiteSpace: 'pre',
            }}
            fontFamily='Berkeley Mono, monospace'
            fontSize={12}
            letterSpacing='0.01em'
          >
            <tspan x={114} y={153.022}>
              Research
            </tspan>
          </text>
          <rect x={263} y={139.75} width={38} height={17} rx={8.5} fill='#F5F5F5' />
          <text
            fill='#404040'
            xmlSpace='preserve'
            style={{
              whiteSpace: 'pre',
            }}
            fontFamily='Berkeley Mono, monospace'
            fontSize={10}
            letterSpacing='-0.01em'
          >
            <tspan x={267} y={151.81}>
              Agent
            </tspan>
          </text>
        </g>
        <g filter='url(#filter3_d_603_9516)'>
          <rect x={78} y={162.75} width={235} height={42} rx={6} fill='white' />
          <rect x={78.35} y={163.1} width={234.3} height={41.3} rx={5.65} stroke='#D4D4D4' strokeWidth={0.7} />
          <g clipPath='url(#clip3_603_9516)'>
            <rect x={90} y={174.75} width={16} height={16} rx={2} fill='#FEF4EE' />
            <path d='M115 175.75V199.75H91V175.75H115Z' fill='white' fillOpacity={0.01} />
            <path
              d='M95.8665 181.1L97.5165 182.75L95.8665 184.4M99.1663 184.5H100.333M93.333 178.083H102.666V187.416H93.333V178.083Z'
              stroke='#F2572B'
              strokeLinecap='square'
            />
          </g>
          <text
            fill='#0A0A0A'
            xmlSpace='preserve'
            style={{
              whiteSpace: 'pre',
            }}
            fontFamily='Berkeley Mono, monospace'
            fontSize={12}
            letterSpacing='0.01em'
          >
            <tspan x={114} y={188.022}>
              Code Agent
            </tspan>
          </text>
          <rect x={263} y={174.75} width={38} height={17} rx={8.5} fill='#F5F5F5' />
          <text
            fill='#404040'
            xmlSpace='preserve'
            style={{
              whiteSpace: 'pre',
            }}
            fontFamily='Berkeley Mono, monospace'
            fontSize={10}
            letterSpacing='-0.01em'
          >
            <tspan x={267} y={186.81}>
              Agent
            </tspan>
          </text>
        </g>
        <g filter='url(#filter4_d_603_9516)'>
          <rect x={78} y={198.75} width={235} height={42} rx={6} fill='white' />
          <rect x={78.35} y={199.1} width={234.3} height={41.3} rx={5.65} stroke='#D4D4D4' strokeWidth={0.7} />
          <g clipPath='url(#clip4_603_9516)'>
            <rect x={90} y={210.75} width={16} height={16} rx={2} fill='#FEF4EE' />
            <path d='M115 211.75V235.75H91V211.75H115Z' fill='white' fillOpacity={0.01} />
            <path
              d='M95.8665 217.1L97.5165 218.75L95.8665 220.4M99.1663 220.5H100.333M93.333 214.083H102.666V223.416H93.333V214.083Z'
              stroke='#F2572B'
              strokeLinecap='square'
            />
          </g>
          <text
            fill='#0A0A0A'
            xmlSpace='preserve'
            style={{
              whiteSpace: 'pre',
            }}
            fontFamily='Berkeley Mono, monospace'
            fontSize={12}
            letterSpacing='0.01em'
          >
            <tspan x={114} y={224.022}>
              QA Agent
            </tspan>
          </text>
          <rect x={263} y={210.75} width={38} height={17} rx={8.5} fill='#F5F5F5' />
          <text
            fill='#404040'
            xmlSpace='preserve'
            style={{
              whiteSpace: 'pre',
            }}
            fontFamily='Berkeley Mono, monospace'
            fontSize={10}
            letterSpacing='-0.01em'
          >
            <tspan x={267} y={222.81}>
              Agent
            </tspan>
          </text>
        </g>
        <path
          d='M41 89V146C41 150.418 44.5817 154 49 154H78'
          stroke='#D4D4D4'
          strokeDasharray='4 4'
          className='group-hover:stroke-brand-base transition-[stroke] delay-100'
        />

        <path
          d='M41 150V179C41 183.418 44.5817 187 49 187H78'
          stroke='#D4D4D4'
          strokeDasharray='4 4'
          className='group-hover:stroke-brand-base transition-[stroke] delay-200'
        />
        <path
          d='M41 150V209C41 213.418 44.5817 217 49 217H78'
          stroke='#D4D4D4'
          strokeDasharray='4 4'
          className='group-hover:stroke-brand-base transition-[stroke] delay-300'
        />

        <path d='M41 57V89C41 93.4183 44.5817 97 49 97H78' stroke='#F2572B' strokeDasharray='4 4' />
      </g>
      <defs>
        <filter
          id='filter0_d_603_9516'
          x={14}
          y={15}
          width={136}
          height={50}
          filterUnits='userSpaceOnUse'
          colorInterpolationFilters='sRGB'
        >
          <feFlood floodOpacity={0} result='BackgroundImageFix' />
          <feColorMatrix
            in='SourceAlpha'
            type='matrix'
            values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0'
            result='hardAlpha'
          />
          <feOffset dy={1} />
          <feGaussianBlur stdDeviation={1} />
          <feColorMatrix type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.08 0' />
          <feBlend mode='normal' in2='BackgroundImageFix' result='effect1_dropShadow_603_9516' />
          <feBlend mode='normal' in='SourceGraphic' in2='effect1_dropShadow_603_9516' result='shape' />
        </filter>
        <clipPath id='bgblur_0_603_9516_clip_path' transform='translate(-14 -15)'>
          <path d='M22 29C22 25.6863 24.6863 23 28 23H136C139.314 23 142 25.6863 142 29V51C142 54.3137 139.314 57 136 57H28C24.6863 57 22 54.3137 22 51V29Z' />
        </clipPath>
        <filter
          id='filter1_d_603_9516'
          x={76}
          y={72.75}
          width={239}
          height={46}
          filterUnits='userSpaceOnUse'
          colorInterpolationFilters='sRGB'
        >
          <feFlood floodOpacity={0} result='BackgroundImageFix' />
          <feColorMatrix
            in='SourceAlpha'
            type='matrix'
            values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0'
            result='hardAlpha'
          />
          <feOffset />
          <feGaussianBlur stdDeviation={1} />
          <feColorMatrix type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.08 0' />
          <feBlend mode='normal' in2='BackgroundImageFix' result='effect1_dropShadow_603_9516' />
          <feBlend mode='normal' in='SourceGraphic' in2='effect1_dropShadow_603_9516' result='shape' />
        </filter>
        <filter
          id='filter2_d_603_9516'
          x={76}
          y={125.75}
          width={239}
          height={46}
          filterUnits='userSpaceOnUse'
          colorInterpolationFilters='sRGB'
        >
          <feFlood floodOpacity={0} result='BackgroundImageFix' />
          <feColorMatrix
            in='SourceAlpha'
            type='matrix'
            values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0'
            result='hardAlpha'
          />
          <feOffset />
          <feGaussianBlur stdDeviation={1} />
          <feColorMatrix type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.08 0' />
          <feBlend mode='normal' in2='BackgroundImageFix' result='effect1_dropShadow_603_9516' />
          <feBlend mode='normal' in='SourceGraphic' in2='effect1_dropShadow_603_9516' result='shape' />
        </filter>
        <filter
          id='filter3_d_603_9516'
          x={76}
          y={160.75}
          width={239}
          height={46}
          filterUnits='userSpaceOnUse'
          colorInterpolationFilters='sRGB'
        >
          <feFlood floodOpacity={0} result='BackgroundImageFix' />
          <feColorMatrix
            in='SourceAlpha'
            type='matrix'
            values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0'
            result='hardAlpha'
          />
          <feOffset />
          <feGaussianBlur stdDeviation={1} />
          <feColorMatrix type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.08 0' />
          <feBlend mode='normal' in2='BackgroundImageFix' result='effect1_dropShadow_603_9516' />
          <feBlend mode='normal' in='SourceGraphic' in2='effect1_dropShadow_603_9516' result='shape' />
        </filter>
        <filter
          id='filter4_d_603_9516'
          x={76}
          y={196.75}
          width={239}
          height={46}
          filterUnits='userSpaceOnUse'
          colorInterpolationFilters='sRGB'
        >
          <feFlood floodOpacity={0} result='BackgroundImageFix' />
          <feColorMatrix
            in='SourceAlpha'
            type='matrix'
            values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0'
            result='hardAlpha'
          />
          <feOffset />
          <feGaussianBlur stdDeviation={1} />
          <feColorMatrix type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.08 0' />
          <feBlend mode='normal' in2='BackgroundImageFix' result='effect1_dropShadow_603_9516' />
          <feBlend mode='normal' in='SourceGraphic' in2='effect1_dropShadow_603_9516' result='shape' />
        </filter>
        <linearGradient id='paint0_linear_603_9516' x1={170} y1={175} x2={170} y2={223} gradientUnits='userSpaceOnUse'>
          <stop stopColor='#D9D9D9' />
          <stop offset={1} stopColor='#737373' stopOpacity={0} />
        </linearGradient>
        <clipPath id='clip1_603_9516'>
          <rect x={90} y={86.75} width={16} height={16} rx={2} fill='white' />
        </clipPath>
        <clipPath id='clip2_603_9516'>
          <rect x={90} y={139.75} width={16} height={16} rx={2} fill='white' />
        </clipPath>
        <clipPath id='clip3_603_9516'>
          <rect x={90} y={174.75} width={16} height={16} rx={2} fill='white' />
        </clipPath>
        <clipPath id='clip4_603_9516'>
          <rect x={90} y={210.75} width={16} height={16} rx={2} fill='white' />
        </clipPath>
      </defs>
    </svg>
  )
}
