# {{/* Define a named template for the common labels */}}
# {{- define "function-manager.labels" -}}
# app: function-manager
# {{- end -}}

# {{/* Define a named template for the common match labels used in Deployment selectors */}}
# {{- define "function-manager.matchLabels" -}}
# {{- include "function-manager.labels" . }}
# {{- end -}}

# {{/* Define a named template to compute the deployment name */}}
# {{- define "function-manager.deploymentName" -}}
# {{- $values := .Values -}}
# {{- printf "%s-%s" $values.chain .oracleKey.name -}}
# {{- end -}}

# {{/* Define a named template to compute the persistentVolumeClaim name */}}
# {{- define "function-manager.pvcName" -}}
# {{- $values := .Values -}}
# {{- printf "function-manager-%s-%s-pvc" $values.chain .oracleKey.name -}}
# {{- end -}}
