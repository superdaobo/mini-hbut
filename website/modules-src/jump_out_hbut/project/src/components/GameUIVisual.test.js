import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import GameHUD from './GameHUD.vue'
import GameOverScreen from './GameOverScreen.vue'
import StartScreen from './StartScreen.vue'

const EMOJI_ICON_PATTERN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u

describe('jump_out_hbut UI visual contract', () => {
  it('HUD 使用清晰文本和 CSS 图标，不依赖 emoji 图标', () => {
    const wrapper = mount(GameHUD, {
      props: {
        score: 18,
        combo: 3,
        jumpCount: 7,
        chargePercent: 0.5,
        muted: false
      }
    })

    expect(wrapper.text()).toContain('跳跃 7')
    expect(wrapper.find('.mute-btn').attributes('aria-label')).toBe('关闭音效')
    expect(wrapper.text()).not.toMatch(EMOJI_ICON_PATTERN)
  })

  it('开始页用校园主题文案和非 emoji 提示呈现玩法', () => {
    const wrapper = mount(StartScreen, {
      props: {
        highScore: 12
      }
    })

    expect(wrapper.text()).toContain('跃过南湖与湖工地标')
    expect(wrapper.text()).toContain('按住屏幕蓄力')
    expect(wrapper.text()).not.toMatch(EMOJI_ICON_PATTERN)
  })

  it('游戏结束页的上传失败状态使用文本状态，不依赖 emoji 图标', () => {
    const wrapper = mount(GameOverScreen, {
      props: {
        score: 9,
        jumpCount: 4,
        duration: 12000,
        uploadFailed: true,
        retrying: false
      }
    })

    expect(wrapper.text()).toContain('分数上传失败')
    expect(wrapper.find('.upload-error-status').exists()).toBe(true)
    expect(wrapper.text()).not.toMatch(EMOJI_ICON_PATTERN)
  })
})
