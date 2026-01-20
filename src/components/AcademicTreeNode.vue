<script>
export default { name: 'AcademicTreeNode' }
</script>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  node: { type: Object, required: true }
})

const hasChildren = computed(() => Array.isArray(props.node.children) && props.node.children.length > 0)
const hasCourses = computed(() => Array.isArray(props.node.kcList) && props.node.kcList.length > 0)

const requirementText = computed(() => {
  const parts = []
  if (props.node.yqzdxf) parts.push(`最低学分 ${props.node.yqzdxf}`)
  if (props.node.yqzgxf) parts.push(`最高学分 ${props.node.yqzgxf}`)
  if (props.node.yqzdms) parts.push(`最低门数 ${props.node.yqzdms}`)
  if (props.node.yqzgms) parts.push(`最高门数 ${props.node.yqzgms}`)
  return parts.join(' / ')
})
</script>

<template>
  <div class="tree-node">
    <details>
      <summary>
        <div class="node-title">
          <span class="name">{{ node.nodeName || '-' }}</span>
          <span class="meta" v-if="node.hdxf">已获学分 {{ node.hdxf }}</span>
        </div>
        <div class="node-require" v-if="requirementText">{{ requirementText }}</div>
      </summary>

      <div class="node-body">
        <div v-if="hasCourses" class="course-list">
          <div class="course-item" v-for="(c, idx) in node.kcList" :key="idx">
            <div class="course-name">{{ c.kcmc }}</div>
            <div class="course-meta">
              <span>{{ c.kclb }}</span>
              <span>{{ c.kcxz }}</span>
              <span>学分 {{ c.xf }}</span>
              <span v-if="c.wczt">{{ c.wczt }}</span>
            </div>
          </div>
        </div>

        <div v-if="hasChildren" class="children">
          <AcademicTreeNode v-for="child in node.children" :key="child.nodeId" :node="child" />
        </div>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tree-node {
  border-left: 2px solid #e5e7eb;
  padding-left: 12px;
  margin: 8px 0;
}

summary {
  list-style: none;
  cursor: pointer;
}

summary::-webkit-details-marker {
  display: none;
}

.node-title {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-weight: 600;
  color: #111827;
}

.node-require {
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
}

.node-body {
  padding: 8px 0 4px;
}

.course-list {
  background: #f9fafb;
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 8px;
}

.course-item {
  padding: 6px 4px;
  border-bottom: 1px dashed #e5e7eb;
}

.course-item:last-child {
  border-bottom: none;
}

.course-name {
  font-weight: 600;
  color: #111827;
}

.course-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: #6b7280;
}

.children {
  margin-top: 8px;
}
</style>
