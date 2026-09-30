<?xml version="1.0"?>
<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="2.0">
  <xsl:template match="library">
    <xsl:if test="'true'">
      <xsl:value-of select="boolean(child::shelf)"/>
    </xsl:if>
    <xsl:choose>
      <xsl:when test="not(not(open))">
        <xsl:text>open</xsl:text>
      </xsl:when>
    </xsl:choose>
  </xsl:template>
</xsl:stylesheet>
